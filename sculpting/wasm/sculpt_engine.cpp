/*
 * sculpt_engine.cpp
 * ═══════════════════════════════════════════════════════════════════════════
 * SM Engine — Professional WASM Sculpting Core
 * Matches every brush in character-tools.js + SculptingManager.js exactly.
 *
 * COMPILE (from the repository root):
 *   emcc sculpting/wasm/sculpt_engine.cpp \
 *     sculpting/wasm/terrain/terrain_sculpt_engine.cpp \
 *     rendering/wasm/render_accel_engine.cpp -O2 -msimd128 \
 *     -s WASM=1 \
 *     -s MODULARIZE=1 \
 *     -s EXPORT_NAME="SculptEngineWASM" \
 *     -s ALLOW_MEMORY_GROWTH=1 \
 *     -s INITIAL_MEMORY=67108864 \
 *     -s MAXIMUM_MEMORY=1073741824 \
 *     -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap','HEAPF32','HEAPU32','HEAP32','HEAPU8','getValue','setValue']" \
 *     -s EXPORTED_FUNCTIONS="[\
 *       '_wasm_alloc','_wasm_free',\
 *       '_set_mesh','_get_dirty_range',\
 *       '_build_adjacency','_build_bvh','_rebuild_bvh','_refit_bvh',\
 *       '_query_radius',\
 *       '_compute_normals',\
 *       '_sync_mask','_sync_normals',\
 *       '_sculpt_clay','_sculpt_inflate','_sculpt_flatten',\
 *       '_sculpt_smooth','_sculpt_pinch','_sculpt_crease',\
 *       '_sculpt_draw','_sculpt_layer','_sculpt_topology',\
 *       '_sculpt_surface_offset','_sculpt_directional_smooth',\
 *       '_sculpt_grab',\
 *       '_global_smooth','_hardness_contrast',\
 *       '_angle_preserving_smooth',\
 *       '_smooth_standalone',\
 *       '_terrain_bind','_terrain_sync','_terrain_clear_state',\
 *       '_terrain_get_dirty_rect','_terrain_apply_brush',\
 *       '_render_analyze_luminance','_render_select_lights'\
 *     ]" \
 *     -o sculpt_engine.js
 *
 * Memory layout:
 *   All mesh data (positions, normals, mask) lives in WASM heap.
 *   JS writes to it via HEAPF32. C++ kernels operate in-place.
 *   Dirty range [min, max] lets JS do partial GPU buffer updates.
 * ═══════════════════════════════════════════════════════════════════════════
 */

#include <emscripten.h>
#include <cmath>
#include <cstring>
#include <cstdlib>
#include <climits>
#include <algorithm>
#include <stdint.h>

#ifdef __wasm_simd128__
  #include <wasm_simd128.h>
  #define USE_SIMD 1
#else
  #define USE_SIMD 0
#endif

/* ─────────────────────────────────────────────────────────────────────────
   GLOBAL MESH STATE  (set once per activateSculpting() call)
───────────────────────────────────────────────────────────────────────── */
static float*    g_pos   = nullptr;   // positions Float32Array  (3 floats/vert)
static float*    g_norm  = nullptr;   // normals   Float32Array  (3 floats/vert)
static float*    g_mask  = nullptr;   // mask      Float32Array  (1 float/vert)
static uint32_t* g_idx   = nullptr;   // index     Uint32Array   (triangle list)
static int       g_verts = 0;
static int       g_tris  = 0;         // index.length / 3

/* Dirty range written by every kernel — JS reads this for partial GPU upload */
static int g_dmin = INT_MAX;
static int g_dmax = INT_MIN;

/* ─────────────────────────────────────────────────────────────────────────
   ADJACENCY  (built once, lives in WASM heap)
───────────────────────────────────────────────────────────────────────── */
static uint32_t* g_adj_flat    = nullptr;
static uint32_t* g_adj_offsets = nullptr;
static uint32_t* g_adj_counts  = nullptr;

/* ─────────────────────────────────────────────────────────────────────────
   BVH
───────────────────────────────────────────────────────────────────────── */
struct BVHNode {
    float  bmin[3], bmax[3];
    int    left, right;         // -1 if leaf
    int    leaf_start, leaf_n;  // index into g_bvh_order[]
};

static BVHNode* g_bvh        = nullptr;
static int*     g_bvh_order  = nullptr;   // sorted vertex indices
static int      g_bvh_nodes  = 0;
static int      g_bvh_cap    = 0;

/* Per-query result buffer — avoids allocation every stroke */
#define MAX_HITS 65536
struct Hit { int vi; float dist; };
static Hit  g_hits[MAX_HITS];
static int  g_hit_n = 0;

/* ═══════════════════════════════════════════════════════════════════════════
   MATH HELPERS
═══════════════════════════════════════════════════════════════════════════ */
static inline float sq(float x)              { return x*x; }
static inline float dot3(float ax,float ay,float az,
                         float bx,float by,float bz) { return ax*bx+ay*by+az*bz; }
static inline void  cross3(float ax,float ay,float az,
                            float bx,float by,float bz,
                            float &rx,float &ry,float &rz)
{ rx=ay*bz-az*by; ry=az*bx-ax*bz; rz=ax*by-ay*bx; }
static inline void  normalize3(float &x,float &y,float &z) {
    float l=sqrtf(x*x+y*y+z*z);
    if(l>1e-8f){x/=l;y/=l;z/=l;}
}

/*
 * Smooth-step falloff — identical to character-tools.js getFalloff()
 *   t = 1 - dist/radius
 *   return t*t*(3-2*t)
 */
static inline float falloff(float dist, float radius) {
    if(dist>=radius) return 0.f;
    float t = 1.f - dist/radius;
    return t*t*(3.f-2.f*t);
}

/*
 * Shaped falloff — applies brushFalloff hardness on top
 *   if hardness > 0.5  → pow(t, 1+hardness)   (matches JS)
 */
static inline float falloff_shaped(float dist, float radius, float hardness) {
    float t = falloff(dist, radius);
    if(hardness > 0.5f) t = powf(t, 1.f+hardness);
    return t;
}

/* Dirty range tracking */
static inline void mark_dirty(int i3) {
    if(i3   < g_dmin) g_dmin = i3;
    if(i3+3 > g_dmax) g_dmax = i3+3;
}

/* Apply offset to vertex vi, tracking dirty range */
static inline void apply_off(int vi, float ox, float oy, float oz) {
    int i = vi*3;
    g_pos[i  ] += ox;
    g_pos[i+1] += oy;
    g_pos[i+2] += oz;
    mark_dirty(i);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC C API
═══════════════════════════════════════════════════════════════════════════ */
extern "C" {

/* ── Memory ────────────────────────────────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE void* wasm_alloc(int bytes) { return malloc((size_t)bytes); }
EMSCRIPTEN_KEEPALIVE void  wasm_free(void* p)    { free(p); }

/* ── ABI / lifecycle ───────────────────────────────────────────────────── */
/*
 * Keep the JS bridge and generated Emscripten wrapper versioned. This avoids
 * silently calling a stale cached WASM module after the exported C API grows.
 */
EMSCRIPTEN_KEEPALIVE int get_abi_version() { return 4; }

EMSCRIPTEN_KEEPALIVE int get_mesh_vertex_count()  { return g_verts; }
EMSCRIPTEN_KEEPALIVE int get_mesh_triangle_count() { return g_tris; }

/*
 * JS owns the mesh/adjacency buffers allocated through wasm_alloc(). This
 * function only releases C++-owned acceleration data and clears every global
 * pointer before JS frees its buffers.
 */
EMSCRIPTEN_KEEPALIVE
void clear_mesh_state() {
    free(g_bvh);
    free(g_bvh_order);
    g_bvh = nullptr;
    g_bvh_order = nullptr;
    g_bvh_nodes = 0;
    g_bvh_cap = 0;

    g_pos = nullptr;
    g_norm = nullptr;
    g_mask = nullptr;
    g_idx = nullptr;
    g_adj_flat = nullptr;
    g_adj_offsets = nullptr;
    g_adj_counts = nullptr;
    g_verts = 0;
    g_tris = 0;
    g_hit_n = 0;
    g_dmin = INT_MAX;
    g_dmax = INT_MIN;
}

/* ── Mesh binding ──────────────────────────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
void set_mesh(int pos_ptr, int norm_ptr, int mask_ptr,
              int idx_ptr,  int verts,   int tri_count)
{
    g_pos   = (float*)    pos_ptr;
    g_norm  = (float*)    norm_ptr;
    g_mask  = (float*)    mask_ptr;
    g_idx   = (uint32_t*) idx_ptr;
    g_verts = verts;
    g_tris  = tri_count;
    g_dmin  = INT_MAX;
    g_dmax  = INT_MIN;
}

EMSCRIPTEN_KEEPALIVE
void get_dirty_range(int* out_min, int* out_max) {
    *out_min = (g_dmin==INT_MAX) ? 0 : g_dmin;
    *out_max = (g_dmax==INT_MIN) ? 0 : g_dmax;
    g_dmin = INT_MAX;
    g_dmax = INT_MIN;
}

/* ── Sync (called from JS after JS-side changes) ───────────────────────── */
EMSCRIPTEN_KEEPALIVE void sync_mask(int mask_ptr)    { g_mask = (float*)mask_ptr; }
EMSCRIPTEN_KEEPALIVE void sync_normals(int norm_ptr) { g_norm = (float*)norm_ptr; }

/* ── Adjacency ─────────────────────────────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
void build_adjacency(int flat_ptr, int off_ptr, int cnt_ptr) {
    g_adj_flat    = (uint32_t*) flat_ptr;
    g_adj_offsets = (uint32_t*) off_ptr;
    g_adj_counts  = (uint32_t*) cnt_ptr;
}

/* ── Normal recomputation ──────────────────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
void compute_normals() {
    if(!g_pos||!g_norm||!g_idx||g_tris==0) return;
    memset(g_norm, 0, g_verts*3*sizeof(float));
    for(int t=0;t<g_tris;t++) {
        uint32_t a=g_idx[t*3],b=g_idx[t*3+1],c=g_idx[t*3+2];
        float ax=g_pos[a*3],ay=g_pos[a*3+1],az=g_pos[a*3+2];
        float bx=g_pos[b*3],by=g_pos[b*3+1],bz=g_pos[b*3+2];
        float cx=g_pos[c*3],cy=g_pos[c*3+1],cz=g_pos[c*3+2];
        float e1x=bx-ax,e1y=by-ay,e1z=bz-az;
        float e2x=cx-ax,e2y=cy-ay,e2z=cz-az;
        float nx,ny,nz; cross3(e1x,e1y,e1z,e2x,e2y,e2z,nx,ny,nz);
        g_norm[a*3]+=nx;g_norm[a*3+1]+=ny;g_norm[a*3+2]+=nz;
        g_norm[b*3]+=nx;g_norm[b*3+1]+=ny;g_norm[b*3+2]+=nz;
        g_norm[c*3]+=nx;g_norm[c*3+1]+=ny;g_norm[c*3+2]+=nz;
    }
    for(int i=0;i<g_verts;i++) normalize3(g_norm[i*3],g_norm[i*3+1],g_norm[i*3+2]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   BVH
═══════════════════════════════════════════════════════════════════════════ */

static int bvh_alloc_node() {
    if(g_bvh_nodes >= g_bvh_cap) {
        g_bvh_cap = g_bvh_cap ? g_bvh_cap*2 : 256;
        g_bvh = (BVHNode*)realloc(g_bvh, g_bvh_cap*sizeof(BVHNode));
    }
    return g_bvh_nodes++;
}

static int bvh_build(int* verts, int n, int depth) {
    int ni = bvh_alloc_node();
    BVHNode& nd = g_bvh[ni];
    nd.bmin[0]=nd.bmin[1]=nd.bmin[2]= 1e30f;
    nd.bmax[0]=nd.bmax[1]=nd.bmax[2]=-1e30f;
    for(int i=0;i<n;i++) {
        int v=verts[i];
        for(int k=0;k<3;k++){
            float c=g_pos[v*3+k];
            if(c<nd.bmin[k]) nd.bmin[k]=c;
            if(c>nd.bmax[k]) nd.bmax[k]=c;
        }
    }
    if(n<=16||depth>20){
        nd.left=nd.right=-1;
        nd.leaf_start=(int)(verts-g_bvh_order);
        nd.leaf_n=n;
        return ni;
    }
    float dx=nd.bmax[0]-nd.bmin[0];
    float dy=nd.bmax[1]-nd.bmin[1];
    float dz=nd.bmax[2]-nd.bmin[2];
    int ax=(dy>dx&&dy>dz)?1:(dz>dx?2:0);
    float mid=(nd.bmin[ax]+nd.bmax[ax])*0.5f;
    int lo=0,hi=n-1;
    while(lo<=hi){
        if(g_pos[verts[lo]*3+ax]<mid) lo++;
        else { std::swap(verts[lo],verts[hi--]); }
    }
    int sp=lo; if(sp==0||sp==n) sp=n/2;
    nd.leaf_start=-1; nd.leaf_n=0;
    nd.left  = bvh_build(verts,     sp,   depth+1);
    nd.right = bvh_build(verts+sp, n-sp,  depth+1);
    return ni;
}

EMSCRIPTEN_KEEPALIVE
void build_bvh() {
    if(!g_pos||g_verts==0) return;
    free(g_bvh_order);
    g_bvh_order=(int*)malloc(g_verts*sizeof(int));
    for(int i=0;i<g_verts;i++) g_bvh_order[i]=i;
    g_bvh_nodes=0;
    bvh_build(g_bvh_order, g_verts, 0);
}

EMSCRIPTEN_KEEPALIVE void rebuild_bvh() { build_bvh(); }

/* Refit existing topology after brush deformation without rebuilding splits. */
static void bvh_refit_node(int ni) {
    if (ni < 0 || ni >= g_bvh_nodes || !g_bvh || !g_pos) return;

    BVHNode& nd = g_bvh[ni];
    if (nd.left == -1) {
        nd.bmin[0] = nd.bmin[1] = nd.bmin[2] = 1e30f;
        nd.bmax[0] = nd.bmax[1] = nd.bmax[2] = -1e30f;
        for (int i = 0; i < nd.leaf_n; i++) {
            const int v = g_bvh_order[nd.leaf_start + i];
            for (int k = 0; k < 3; k++) {
                const float c = g_pos[v * 3 + k];
                if (c < nd.bmin[k]) nd.bmin[k] = c;
                if (c > nd.bmax[k]) nd.bmax[k] = c;
            }
        }
        return;
    }

    bvh_refit_node(nd.left);
    bvh_refit_node(nd.right);
    const BVHNode& left = g_bvh[nd.left];
    const BVHNode& right = g_bvh[nd.right];
    for (int k = 0; k < 3; k++) {
        nd.bmin[k] = std::min(left.bmin[k], right.bmin[k]);
        nd.bmax[k] = std::max(left.bmax[k], right.bmax[k]);
    }
}

EMSCRIPTEN_KEEPALIVE void refit_bvh() {
    if (g_bvh && g_bvh_nodes > 0) bvh_refit_node(0);
}

/* Sphere-AABB overlap */
static bool sphere_aabb(float cx,float cy,float cz,float rSq, const BVHNode& nd) {
    float dx=fmaxf(0.f,fmaxf(nd.bmin[0]-cx, cx-nd.bmax[0]));
    float dy=fmaxf(0.f,fmaxf(nd.bmin[1]-cy, cy-nd.bmax[1]));
    float dz=fmaxf(0.f,fmaxf(nd.bmin[2]-cz, cz-nd.bmax[2]));
    return dx*dx+dy*dy+dz*dz<=rSq;
}

static void bvh_query(int ni, float cx,float cy,float cz,float rSq) {
    if(ni<0||ni>=g_bvh_nodes) return;
    const BVHNode& nd=g_bvh[ni];
    if(!sphere_aabb(cx,cy,cz,rSq,nd)) return;
    if(nd.left==-1){
        for(int i=0;i<nd.leaf_n&&g_hit_n<MAX_HITS;i++){
            int v=g_bvh_order[nd.leaf_start+i];
            float vx=g_pos[v*3],vy=g_pos[v*3+1],vz=g_pos[v*3+2];
            float d2=sq(vx-cx)+sq(vy-cy)+sq(vz-cz);
            if(d2<rSq) g_hits[g_hit_n++]={v, sqrtf(d2)};
        }
    } else {
        bvh_query(nd.left, cx,cy,cz,rSq);
        bvh_query(nd.right,cx,cy,cz,rSq);
    }
}

/*
 * query_radius — called from JS bridge before every WASM brush kernel.
 * Fills outIdx / outDist buffers, returns count.
 * cx,cy,cz are LOCAL-SPACE coordinates (already transformed by JS).
 */
EMSCRIPTEN_KEEPALIVE
int query_radius(float cx, float cy, float cz, float radius,
                 int* out_idx, float* out_dist)
{
    g_hit_n=0;
    float rSq=radius*radius;
    if(g_bvh && g_bvh_nodes>0) {
        bvh_query(0, cx,cy,cz,rSq);
    } else {
        /* Linear fallback (pre-BVH or very small mesh) */
        for(int i=0;i<g_verts&&g_hit_n<MAX_HITS;i++){
            float d2=sq(g_pos[i*3]-cx)+sq(g_pos[i*3+1]-cy)+sq(g_pos[i*3+2]-cz);
            if(d2<rSq) g_hits[g_hit_n++]={i, sqrtf(d2)};
        }
    }
    for(int i=0;i<g_hit_n;i++){ out_idx[i]=g_hits[i].vi; out_dist[i]=g_hits[i].dist; }
    return g_hit_n;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BRUSH KERNELS
   Each function receives the hit array produced by query_radius() and the
   brush parameters from character-tools.js.  It mirrors the JS math exactly.
═══════════════════════════════════════════════════════════════════════════ */

/*
 * sculpt_clay — builds along hit surface normal (localNormal)
 *   JS:  offset.copy(localNormal).multiplyScalar(factor * baseStrength)
 *   baseStrength = brushStrength * 0.08 * direction
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_clay(const int* idx, const float* dist, int n,
                 float lnx, float lny, float lnz,
                 float radius, float strength, float hardness, int invert)
{
    float dir = invert ? -1.f : 1.f;
    float base = strength * 0.08f * dir;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float f = falloff_shaped(d,radius,hardness) * mf;
        if(f<=0.001f) continue;
        float s=f*base;
        apply_off(vi, lnx*s, lny*s, lnz*s);
    }
}

/*
 * sculpt_inflate — expands along per-vertex normal
 *   JS:  offset.copy(vertexNormal).multiplyScalar(factor * baseStrength)
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_inflate(const int* idx, const float* dist, int n,
                    float radius, float strength, float hardness, int invert)
{
    float dir = invert ? -1.f : 1.f;
    float base = strength * 0.08f * dir;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float f = falloff_shaped(d,radius,hardness) * mf;
        if(f<=0.001f) continue;
        float s=f*base;
        apply_off(vi, g_norm[vi*3]*s, g_norm[vi*3+1]*s, g_norm[vi*3+2]*s);
    }
}

/*
 * sculpt_flatten — pushes towards the average plane of hit vertices
 *   JS:  planeDist = avgNormal.dot(currentPos - avgPos)
 *        offset = avgNormal * (-planeDist * factor * strength * 0.2)
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_flatten(const int* idx, const float* dist, int n,
                    float radius, float strength, float hardness)
{
    if(n==0) return;
    float avgPx=0,avgPy=0,avgPz=0,avgNx=0,avgNy=0,avgNz=0;
    for(int h=0;h<n;h++){
        int vi=idx[h];
        avgPx+=g_pos[vi*3];  avgPy+=g_pos[vi*3+1]; avgPz+=g_pos[vi*3+2];
        avgNx+=g_norm[vi*3]; avgNy+=g_norm[vi*3+1];avgNz+=g_norm[vi*3+2];
    }
    float inv=1.f/n;
    avgPx*=inv;avgPy*=inv;avgPz*=inv;
    normalize3(avgNx,avgNy,avgNz);
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float f = falloff_shaped(d,radius,hardness) * mf;
        if(f<=0.001f) continue;
        float px=g_pos[vi*3],py=g_pos[vi*3+1],pz=g_pos[vi*3+2];
        float pd = dot3(avgNx,avgNy,avgNz, px-avgPx,py-avgPy,pz-avgPz);
        float s  = -pd * f * strength * 0.2f;
        apply_off(vi, avgNx*s, avgNy*s, avgNz*s);
    }
}

/*
 * sculpt_smooth — moves towards average position of hit vertices
 *   JS:  offset.subVectors(avgPos, currentPos).multiplyScalar(factor * strength * 0.5)
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_smooth(const int* idx, const float* dist, int n,
                   float radius, float strength, float hardness)
{
    if(n==0) return;
    float avgPx=0,avgPy=0,avgPz=0;
    for(int h=0;h<n;h++){
        int vi=idx[h];
        avgPx+=g_pos[vi*3]; avgPy+=g_pos[vi*3+1]; avgPz+=g_pos[vi*3+2];
    }
    float inv=1.f/n;
    avgPx*=inv; avgPy*=inv; avgPz*=inv;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float f = falloff_shaped(d,radius,hardness) * mf;
        if(f<=0.001f) continue;
        float s=f*strength*0.5f;
        apply_off(vi,
            (avgPx-g_pos[vi*3])*s,
            (avgPy-g_pos[vi*3+1])*s,
            (avgPz-g_pos[vi*3+2])*s);
    }
}

/*
 * sculpt_pinch — pulls towards brush local center
 *   JS:  toCenter = localPoint - currentPos
 *        offset = toCenter * (factor * baseStrength * 3.0)
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_pinch(const int* idx, const float* dist, int n,
                  float lcx, float lcy, float lcz,
                  float radius, float strength, float hardness, int invert)
{
    float dir  = invert ? -1.f : 1.f;
    float base = strength * 0.08f * dir * 3.f;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float f = falloff_shaped(d,radius,hardness) * mf;
        if(f<=0.001f) continue;
        float s=f*base;
        apply_off(vi,
            (lcx-g_pos[vi*3])*s,
            (lcy-g_pos[vi*3+1])*s,
            (lcz-g_pos[vi*3+2])*s);
    }
}

/*
 * sculpt_crease — sharpen ridges with quadratic falloff
 *   JS:  cFactor = pow(factor,2)
 *        offset  = localNormal * (cFactor * baseStrength * 0.8)
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_crease(const int* idx, const float* dist, int n,
                   float lnx, float lny, float lnz,
                   float radius, float strength, float hardness, int invert)
{
    float dir  = invert ? -1.f : 1.f;
    float base = strength * 0.06f * dir;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float ft = falloff_shaped(d,radius,hardness) * mf;
        float f  = ft*ft;   /* pow(factor,2) */
        if(f<=0.001f) continue;
        float s=f*base*0.8f;
        apply_off(vi, lnx*s, lny*s, lnz*s);
    }
}

/*
 * sculpt_draw — sharp pen-like carving, cubic falloff
 *   JS:  factor = pow(getFalloff(v.dist, brushSize), 3)
 *        offset = vertexNormal * (factor * strength)
 *   strength = brushStrength * 0.08 * direction
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_draw(const int* idx, const float* dist, int n,
                 float radius, float strength, int invert)
{
    float dir = invert ? -1.f : 1.f;
    float str = strength * 0.08f * dir;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float t = falloff(d,radius);
        float f = t*t*t * mf;   /* cubic = sharp tip */
        if(f<=0.001f) continue;
        float s=f*str;
        apply_off(vi, g_norm[vi*3]*s, g_norm[vi*3+1]*s, g_norm[vi*3+2]*s);
    }
}

/*
 * sculpt_layer — flat plateau displacement
 *   JS:  if(factor > 0.4) factor = 1.0; else factor = factor * 2.0
 *        offset = localNormal * (factor * layerHeight * 0.2)
 *   layerHeight = strength * 0.05 * direction
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_layer(const int* idx, const float* dist, int n,
                  float lnx, float lny, float lnz,
                  float radius, float strength, int invert)
{
    float dir = invert ? -1.f : 1.f;
    float lh  = strength * 0.05f * dir;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float t = falloff(d,radius);
        float f = (t>0.4f ? 1.f : t*2.f) * mf;   /* plateau clamp */
        if(f<=0.001f) continue;
        float s=f*lh*0.2f;
        apply_off(vi, lnx*s, lny*s, lnz*s);
    }
}

/*
 * sculpt_topology — moves vertex + drags its neighbors at half strength
 *   JS:  for each neighbor: offset = localNormal * (factor * strength * 0.5)
 *        center vertex:     offset = localNormal * (factor * strength)
 *   strength = brushStrength * 0.05 * direction
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_topology(const int* idx, const float* dist, int n,
                     float lnx, float lny, float lnz,
                     float radius, float strength, int invert)
{
    if(!g_adj_flat||!g_adj_offsets||!g_adj_counts) return;
    float dir = invert ? -1.f : 1.f;
    float str = strength * 0.05f * dir;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float f = falloff(d,radius);
        if(f<=0.001f) continue;
        /* Drag neighbors */
        uint32_t off=g_adj_offsets[vi], cnt=g_adj_counts[vi];
        float ns=f*str*0.5f;
        for(uint32_t j=0;j<cnt;j++){
            int ni=(int)g_adj_flat[off+j];
            if(ni>=g_verts) continue;
            apply_off(ni, lnx*ns, lny*ns, lnz*ns);
        }
        /* Move center */
        float cs=f*str;
        apply_off(vi, lnx*cs, lny*cs, lnz*cs);
    }
}

/*
 * sculpt_surface_offset — uniform push along vertex normals
 *   JS:  offset = vertexNormal * (factor * strength)
 *   strength = brushStrength * 0.1 * direction
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_surface_offset(const int* idx, const float* dist, int n,
                           float radius, float strength, int invert)
{
    float dir = invert ? -1.f : 1.f;
    float str = strength * 0.1f * dir;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float f = falloff(d,radius) * mf * str;
        if(fabsf(f)<=0.001f) continue;
        apply_off(vi, g_norm[vi*3]*f, g_norm[vi*3+1]*f, g_norm[vi*3+2]*f);
    }
}

/*
 * sculpt_directional_smooth
 *   JS:  diff = avgPos - currentPos
 *        if stroke direction != 0: remove component along stroke (keep ⊥)
 *        offset = diff * factor * 0.1
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_directional_smooth(const int* idx, const float* dist, int n,
                                float sdx, float sdy, float sdz,
                                float radius, float /*strength*/)
{
    if(n==0) return;
    float avgPx=0,avgPy=0,avgPz=0;
    for(int h=0;h<n;h++){
        int vi=idx[h];
        avgPx+=g_pos[vi*3];avgPy+=g_pos[vi*3+1];avgPz+=g_pos[vi*3+2];
    }
    float inv=1.f/n; avgPx*=inv;avgPy*=inv;avgPz*=inv;
    float hasDir=sdx*sdx+sdy*sdy+sdz*sdz;
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float mf = g_mask ? (1.f-g_mask[vi]) : 1.f;
        if(mf<=0.01f) continue;
        float f = falloff(d,radius) * mf;
        if(f<=0.001f) continue;
        float dx=avgPx-g_pos[vi*3],dy=avgPy-g_pos[vi*3+1],dz=avgPz-g_pos[vi*3+2];
        if(hasDir>0.f){
            float proj=dot3(dx,dy,dz,sdx,sdy,sdz);
            dx-=sdx*proj; dy-=sdy*proj; dz-=sdz*proj;
        }
        float s=f*0.1f;
        apply_off(vi, dx*s, dy*s, dz*s);
    }
}

/*
 * sculpt_grab — translates hit vertices by localDelta
 *   JS:  localDelta = worldDelta.applyQuaternion(mesh.quaternion.invert())
 *        offset = localDelta * (factor * brushStrength)
 */
EMSCRIPTEN_KEEPALIVE
void sculpt_grab(const int* idx, const float* dist, int n,
                 float ldx, float ldy, float ldz,
                 float radius, float strength)
{
    for(int h=0;h<n;h++){
        int vi=idx[h]; float d=dist[h];
        float f = falloff(d,radius) * strength;
        if(f<=0.001f) continue;
        apply_off(vi, ldx*f, ldy*f, ldz*f);
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   GLOBAL OPERATIONS  (full-mesh — expensive, but only on button click)
═══════════════════════════════════════════════════════════════════════════ */

/*
 * global_smooth — Laplacian smooth on entire mesh
 *   Mirrors applyGlobalSmooth(iterations, intensity) in character-tools.js
 */
EMSCRIPTEN_KEEPALIVE
void global_smooth(int iterations, float intensity) {
    if(!g_pos||!g_adj_flat||!g_adj_offsets||!g_adj_counts) return;
    int N=g_verts*3;
    float* src=(float*)malloc(N*sizeof(float));
    float* tgt=(float*)malloc(N*sizeof(float));
    if(!src||!tgt){free(src);free(tgt);return;}
    memcpy(src,g_pos,N*sizeof(float));
    memcpy(tgt,src,  N*sizeof(float));
    for(int k=0;k<iterations;k++){
        for(int i=0;i<g_verts;i++){
            uint32_t off=g_adj_offsets[i], cnt=g_adj_counts[i];
            if(cnt==0) continue;
            float ax=0,ay=0,az=0;
#if USE_SIMD
            /* Process 4 neighbours at a time when SIMD is available */
            uint32_t n4=cnt&~3u;
            for(uint32_t j=0;j<n4;j+=4){
                int n0=g_adj_flat[off+j],n1=g_adj_flat[off+j+1];
                int n2=g_adj_flat[off+j+2],n3=g_adj_flat[off+j+3];
                ax+=src[n0*3]+src[n1*3]+src[n2*3]+src[n3*3];
                ay+=src[n0*3+1]+src[n1*3+1]+src[n2*3+1]+src[n3*3+1];
                az+=src[n0*3+2]+src[n1*3+2]+src[n2*3+2]+src[n3*3+2];
            }
            for(uint32_t j=n4;j<cnt;j++){
                int ni=g_adj_flat[off+j];
                ax+=src[ni*3];ay+=src[ni*3+1];az+=src[ni*3+2];
            }
#else
            for(uint32_t j=0;j<cnt;j++){
                int ni=g_adj_flat[off+j];
                ax+=src[ni*3];ay+=src[ni*3+1];az+=src[ni*3+2];
            }
#endif
            float in=1.f/cnt;
            ax*=in;ay*=in;az*=in;
            tgt[i*3]  =src[i*3]  +(ax-src[i*3]  )*intensity;
            tgt[i*3+1]=src[i*3+1]+(ay-src[i*3+1])*intensity;
            tgt[i*3+2]=src[i*3+2]+(az-src[i*3+2])*intensity;
        }
        float* tmp=src;src=tgt;tgt=tmp;
    }
    memcpy(g_pos,src,N*sizeof(float));
    free(src);free(tgt);
    g_dmin=0; g_dmax=N;
}

/*
 * hardness_contrast — enhances edge sharpness
 *   Mirrors applyHardnessContrast() / contrast=0.5
 *   JS:  pos[i] = cx + (cx - avg.x) * contrast
 */
EMSCRIPTEN_KEEPALIVE
void hardness_contrast(float contrast) {
    if(!g_pos||!g_adj_flat||!g_adj_offsets||!g_adj_counts) return;
    int N=g_verts*3;
    float* temp=(float*)malloc(N*sizeof(float));
    if(!temp) return;
    memcpy(temp,g_pos,N*sizeof(float));
    for(int i=0;i<g_verts;i++){
        uint32_t off=g_adj_offsets[i],cnt=g_adj_counts[i];
        if(cnt==0) continue;
        float ax=0,ay=0,az=0;
        for(uint32_t j=0;j<cnt;j++){
            int ni=g_adj_flat[off+j];
            ax+=temp[ni*3];ay+=temp[ni*3+1];az+=temp[ni*3+2];
        }
        float in=1.f/cnt; ax*=in;ay*=in;az*=in;
        float cx=temp[i*3],cy=temp[i*3+1],cz=temp[i*3+2];
        g_pos[i*3]  =cx+(cx-ax)*contrast;
        g_pos[i*3+1]=cy+(cy-ay)*contrast;
        g_pos[i*3+2]=cz+(cz-az)*contrast;
    }
    free(temp);
    g_dmin=0; g_dmax=N;
}

/*
 * angle_preserving_smooth — only smooths between vertices with similar normals
 *   Mirrors applyAnglePreservingSmooth(iterations, intensity)
 *   normalThreshold = 0.7 (hardcoded in JS, parameterised here)
 */
EMSCRIPTEN_KEEPALIVE
void angle_preserving_smooth(int iterations, float intensity, float thresh) {
    if(!g_pos||!g_norm||!g_adj_flat||!g_adj_offsets||!g_adj_counts) return;
    int N=g_verts*3;
    float* src=(float*)malloc(N*sizeof(float));
    float* tgt=(float*)malloc(N*sizeof(float));
    if(!src||!tgt){free(src);free(tgt);return;}
    memcpy(src,g_pos,N*sizeof(float));
    memcpy(tgt,src,  N*sizeof(float));
    for(int k=0;k<iterations;k++){
        for(int i=0;i<g_verts;i++){
            uint32_t off=g_adj_offsets[i],cnt=g_adj_counts[i];
            if(cnt==0) continue;
            float mnx=g_norm[i*3],mny=g_norm[i*3+1],mnz=g_norm[i*3+2];
            float ax=0,ay=0,az=0; int wt=0;
            for(uint32_t j=0;j<cnt;j++){
                int ni=g_adj_flat[off+j];
                float nnx=g_norm[ni*3],nny=g_norm[ni*3+1],nnz=g_norm[ni*3+2];
                if(dot3(mnx,mny,mnz,nnx,nny,nnz)>thresh){
                    ax+=src[ni*3];ay+=src[ni*3+1];az+=src[ni*3+2]; wt++;
                }
            }
            if(wt>0){
                float in=1.f/wt; ax*=in;ay*=in;az*=in;
                tgt[i*3]  =src[i*3]  +(ax-src[i*3]  )*intensity;
                tgt[i*3+1]=src[i*3+1]+(ay-src[i*3+1])*intensity;
                tgt[i*3+2]=src[i*3+2]+(az-src[i*3+2])*intensity;
            }
        }
        float* tmp=src;src=tgt;tgt=tmp;
    }
    memcpy(g_pos,src,N*sizeof(float));
    free(src);free(tgt);
    g_dmin=0; g_dmax=N;
}

/*
 * smooth_standalone — Laplacian smooth on an external geometry buffer.
 *   Used by extractMaskedGeometry() to smooth the extracted armor mesh
 *   without touching g_pos.
 *   Mirrors smoothGeometry(geometry, iterations) in character-tools.js.
 */
EMSCRIPTEN_KEEPALIVE
void smooth_standalone(int pos_ptr, int float_count,
                       int flat_ptr, int off_ptr, int cnt_ptr, int vert_count,
                       int iterations, float alpha)
{
    float*    pos  = (float*)    pos_ptr;
    uint32_t* flat = (uint32_t*) flat_ptr;
    uint32_t* offs = (uint32_t*) off_ptr;
    uint32_t* cnts = (uint32_t*) cnt_ptr;
    float* src=(float*)malloc(float_count*sizeof(float));
    float* tgt=(float*)malloc(float_count*sizeof(float));
    if(!src||!tgt){free(src);free(tgt);return;}
    memcpy(src,pos,float_count*sizeof(float));
    memcpy(tgt,src,float_count*sizeof(float));
    for(int k=0;k<iterations;k++){
        for(int i=0;i<vert_count;i++){
            uint32_t o=offs[i],c=cnts[i]; if(c==0) continue;
            float ax=0,ay=0,az=0;
            for(uint32_t j=0;j<c;j++){
                int ni=flat[o+j];
                ax+=src[ni*3];ay+=src[ni*3+1];az+=src[ni*3+2];
            }
            float in=1.f/c;
            tgt[i*3]  =src[i*3]  +((ax*in)-src[i*3]  )*alpha;
            tgt[i*3+1]=src[i*3+1]+((ay*in)-src[i*3+1])*alpha;
            tgt[i*3+2]=src[i*3+2]+((az*in)-src[i*3+2])*alpha;
        }
        float* tmp=src;src=tgt;tgt=tmp;
    }
    memcpy(pos,src,float_count*sizeof(float));
    free(src);free(tgt);
}

} // extern "C"
