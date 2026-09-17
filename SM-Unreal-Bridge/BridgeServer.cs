using System.Net;
using System.Text;
using System.Text.Json;
using SM.UnrealBridge.Models;

namespace SM.UnrealBridge;

public sealed class BridgeServer : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private readonly HttpListener _listener;
    private readonly UnrealBridgeService _service;
    private readonly CancellationTokenSource _cts = new();
    private Task? _listenTask;

    public int Port { get; }
    public string SessionToken => _service.SessionToken;

    public BridgeServer(UnrealBridgeService service, int port = 8765)
    {
        _service = service;
        Port = port;

        _listener = new HttpListener();
        _listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
    }

    public void Start()
    {
        try
        {
            _listener.Start();
            Console.Error.WriteLine($"[SM Unreal Bridge] HTTP Server listening exclusively on http://127.0.0.1:{Port}/");
            Console.Error.WriteLine($"[SM Unreal Bridge] Session Token: {_service.SessionToken}");
            _listenTask = ListenLoopAsync(_cts.Token);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[SM Unreal Bridge] Failed to start HTTP listener on port {Port}: {ex.Message}");
        }
    }

    public void Stop()
    {
        _cts.Cancel();
        try
        {
            if (_listener.IsListening)
            {
                _listener.Stop();
            }
        }
        catch { }
    }

    private async Task ListenLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener.IsListening)
        {
            try
            {
                var context = await _listener.GetContextAsync();
                _ = ProcessRequestAsync(context);
            }
            catch (HttpListenerException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[SM Unreal Bridge] Listener error: {ex.Message}");
            }
        }
    }

    private async Task ProcessRequestAsync(HttpListenerContext context)
    {
        var req = context.Request;
        var res = context.Response;

        // Apply CORS headers for local SM Engine frontend
        res.Headers.Add("Access-Control-Allow-Origin", "*");
        res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.Headers.Add("Access-Control-Allow-Headers", "Content-Type, X-Bridge-Token");

        if (req.HttpMethod == "OPTIONS")
        {
            res.StatusCode = (int)HttpStatusCode.NoContent;
            res.Close();
            return;
        }

        try
        {
            var path = req.Url?.AbsolutePath.ToLowerInvariant() ?? "/";

            // GET /health or POST /health
            if (path is "/health" or "/status")
            {
                var health = _service.GetHealth();
                await SendJsonResponseAsync(res, health);
                return;
            }

            // GET /download?file=... for serving cooked GLB binaries
            if (path == "/download" && req.HttpMethod == "GET")
            {
                var queryFile = req.QueryString["file"];
                if (string.IsNullOrWhiteSpace(queryFile) || queryFile.Contains(".."))
                {
                    res.StatusCode = (int)HttpStatusCode.BadRequest;
                    await SendJsonResponseAsync(res, new BridgeResponse
                    {
                        Ok = false,
                        Status = "invalid-download-path",
                        Message = "Valid file parameter without '..' is required."
                    });
                    return;
                }

                var fullDownloadPath = Path.GetFullPath(queryFile);
                if (!File.Exists(fullDownloadPath))
                {
                    res.StatusCode = (int)HttpStatusCode.NotFound;
                    await SendJsonResponseAsync(res, new BridgeResponse
                    {
                        Ok = false,
                        Status = "file-not-found",
                        Message = "File not found on disk."
                    });
                    return;
                }

                var ext = Path.GetExtension(fullDownloadPath).ToLowerInvariant();
                res.ContentType = ext switch
                {
                    ".glb" => "model/gltf-binary",
                    ".gltf" => "model/gltf+json",
                    ".png" => "image/png",
                    ".jpg" or ".jpeg" => "image/jpeg",
                    ".webp" => "image/webp",
                    _ => "application/octet-stream"
                };

                using var fileStream = File.OpenRead(fullDownloadPath);
                res.ContentLength64 = fileStream.Length;
                await fileStream.CopyToAsync(res.OutputStream);
                res.OutputStream.Close();
                return;
            }

            // For modifying POST endpoints, verify session token
            var tokenHeader = req.Headers["X-Bridge-Token"];
            string bodyText = "";
            if (req.HasEntityBody)
            {
                using var reader = new StreamReader(req.InputStream, req.ContentEncoding);
                bodyText = await reader.ReadToEndAsync();
            }

            BridgeRequest? bridgeReq = null;
            if (!string.IsNullOrWhiteSpace(bodyText))
            {
                try
                {
                    bridgeReq = JsonSerializer.Deserialize<BridgeRequest>(bodyText, JsonOptions);
                }
                catch (Exception ex)
                {
                    res.StatusCode = (int)HttpStatusCode.BadRequest;
                    await SendJsonResponseAsync(res, new BridgeResponse
                    {
                        Ok = false,
                        Status = "invalid-json",
                        Message = $"JSON deserialization error: {ex.Message}"
                    });
                    return;
                }
            }

            var token = tokenHeader ?? bridgeReq?.Token;
            if (!_service.ValidateToken(token))
            {
                res.StatusCode = (int)HttpStatusCode.Unauthorized;
                await SendJsonResponseAsync(res, new BridgeResponse
                {
                    Ok = false,
                    Status = "unauthorized",
                    Message = "Valid session token required via 'X-Bridge-Token' header or 'token' JSON property.",
                    Diagnostics = { UnrealDiagnostics.Unauthorized("Token mismatch or missing.") }
                });
                return;
            }

            bridgeReq ??= new BridgeRequest();

            switch (path)
            {
                case "/inspect":
                    bridgeReq.Action = "inspect";
                    break;
                case "/parse":
                    bridgeReq.Action = "parse";
                    break;
                case "/import":
                    bridgeReq.Action = "import";
                    break;
                case "/dependencies":
                    bridgeReq.Action = "dependencies";
                    break;
                case "/extract":
                    bridgeReq.Action = "extract";
                    break;
            }

            var response = await _service.HandleAsync(bridgeReq);
            res.StatusCode = response.Ok ? (int)HttpStatusCode.OK : (int)HttpStatusCode.BadRequest;
            await SendJsonResponseAsync(res, response);
        }
        catch (Exception ex)
        {
            res.StatusCode = (int)HttpStatusCode.InternalServerError;
            await SendJsonResponseAsync(res, new BridgeResponse
            {
                Ok = false,
                Status = "server-error",
                Message = ex.Message
            });
        }
    }

    private static async Task SendJsonResponseAsync(HttpListenerResponse res, BridgeResponse response)
    {
        res.ContentType = "application/json; charset=utf-8";
        var json = JsonSerializer.Serialize(response, JsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json);
        res.ContentLength64 = bytes.Length;
        await res.OutputStream.WriteAsync(bytes);
        res.OutputStream.Close();
    }

    public void Dispose()
    {
        Stop();
        ((IDisposable)_listener).Dispose();
        _cts.Dispose();
    }
}
