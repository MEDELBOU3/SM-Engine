using System.Text.Json;
using SM.UnrealBridge.Models;
using SM.UnrealBridge.Tests;

namespace SM.UnrealBridge;

public static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public static async Task Main(string[] args)
    {
        if (args.Contains("--test") || args.Contains("-t"))
        {
            var f1 = PackageTests.RunAllTests();
            var f2 = MeshTests.RunAllTests();
            TextureTests.RunAll();
            MaterialTests.RunAll();
            CacheTests.RunAll();
            var totalFailures = f1 + f2;
            Environment.Exit(totalFailures == 0 ? 0 : 1);
            return;
        }

        var port = 8765;
        for (int i = 0; i < args.Length; i++)
        {
            if ((args[i] == "--port" || args[i] == "-p") && i + 1 < args.Length && int.TryParse(args[i + 1], out var p))
            {
                port = p;
            }
        }

        var service = new UnrealBridgeService();
        using var server = new BridgeServer(service, port);
        server.Start();

        Console.Error.WriteLine(
            $"SM Unreal Bridge started (HTTP: 127.0.0.1:{port}, Token: {service.SessionToken})."
        );

        // Stdio JSON-RPC loop for child process host
        while (true)
        {
            var line = await Console.In.ReadLineAsync();

            if (line == null)
                break;

            if (string.IsNullOrWhiteSpace(line))
                continue;

            BridgeResponse response;

            try
            {
                var request =
                    JsonSerializer.Deserialize<BridgeRequest>(
                        line,
                        JsonOptions
                    );

                if (request == null)
                {
                    response = new BridgeResponse
                    {
                        Ok = false,
                        Status = "invalid-request",
                        Message = "Request is empty."
                    };
                }
                else
                {
                    response =
                        await service.HandleAsync(request);
                }
            }
            catch (Exception ex)
            {
                response = new BridgeResponse
                {
                    Ok = false,
                    Status = "error",
                    Message = ex.Message
                };
            }

            var json =
                JsonSerializer.Serialize(
                    response,
                    JsonOptions
                );

            await Console.Out.WriteLineAsync(json);
            await Console.Out.FlushAsync();
        }
    }
}