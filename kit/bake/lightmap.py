"""Filter narrow lightmap charts without mixing unrelated atlas neighbours.

OIDN handles large surfaces well, but a thin wall end or skirting strip provides
little context. A small, mask-normalized irradiance filter cleans those charts.
Boundary texels can sample beyond a face and catch exterior light. Replace the
outer two texels and gutter from the chart interior. Broad shadow receivers keep
OIDN's original interior result; surface colour/normal textures are untouched. This runs on the baked HDR data, not screen images.
"""
import numpy as np


def chart_regions(meshes, resolution, margin):
    triangles = []
    for mesh in meshes:
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers[1]
        values = np.empty(len(mesh.loops) * 2, dtype=np.float32)
        uv.data.foreach_get('uv', values)
        values = values.reshape(-1, 2) * resolution
        triangles.extend(values[list(tri.loops)] for tri in mesh.loop_triangles)
    parents = list(range(len(triangles)))

    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    vertices = {}
    for i, triangle in enumerate(triangles):
        for vertex in triangle:
            key = tuple(np.round(vertex, 3))
            other = vertices.get(key)
            if other is None:
                vertices[key] = i
            else:
                parents[root(i)] = root(other)
    charts = {}
    for i, triangle in enumerate(triangles):
        charts.setdefault(root(i), []).append(triangle)

    regions = []
    for chart in charts.values():
        points = np.concatenate(chart)
        lo = np.maximum(np.floor(points.min(axis=0)).astype(int) - margin, 0)
        hi = np.minimum(np.ceil(points.max(axis=0)).astype(int) + margin, resolution)
        width, height = hi - lo
        if min(width, height) == 0:
            continue
        mask = np.zeros((height, width), dtype=bool)
        for triangle in chart:
            triangle = triangle - lo
            a, b, c = triangle
            ab, ac = b - a, c - a
            determinant = ab[0] * ac[1] - ab[1] * ac[0]
            if abs(determinant) < 1e-8:
                continue
            start = np.maximum(np.floor(triangle.min(axis=0)).astype(int), 0)
            end = np.minimum(np.ceil(triangle.max(axis=0)).astype(int), [width, height])
            x, y = np.meshgrid(np.arange(start[0], end[0]) + .5,
                               np.arange(start[1], end[1]) + .5)
            u = ((x-a[0])*ac[1] - (y-a[1])*ac[0]) / determinant
            v = (ab[0]*(y-a[1]) - ab[1]*(x-a[0])) / determinant
            mask[start[1]:end[1], start[0]:end[0]] |= (u >= -1e-6) & (v >= -1e-6) & (u+v <= 1+1e-6)
        if not mask.any():
            continue
        # Regenerate only this chart's own gutter. Atlas packing reserves room for
        # both neighbouring gutters, so dilation cannot overwrite another chart.
        gutter = mask.copy()
        for _ in range(margin):
            padded = np.pad(gutter, 1)
            gutter = np.logical_or.reduce([padded[y:y+height, x:x+width]
                                           for y in range(3) for x in range(3)])
        regions.append((lo, hi, mask, gutter))
    return regions


def filter_lightmap(pixels, resolution, regions, sigma=3):
    source = np.asarray(pixels, dtype=np.float32).reshape(resolution, resolution, 4)
    output = source.copy()
    radius = int(np.ceil(3 * sigma))
    weights = np.exp(-np.arange(-radius, radius+1, dtype=np.float32)**2 / (2*sigma*sigma))
    weights /= weights.sum()
    for lo, hi, mask, gutter in regions:
        x0, y0 = lo
        x1, y1 = hi
        # Filter radiance and coverage together, then normalize. Empty texels and
        # neighbouring surfaces contribute no colour, even on one-texel charts.
        core = mask.copy()
        for _ in range(2):
            padded_mask = np.pad(core, 1)
            height, width = core.shape
            core = np.logical_and.reduce([padded_mask[y:y+height, x:x+width]
                                          for y in range(3) for x in range(3)])
        if not core.any():
            core = mask
        values = source[y0:y1, x0:x1].copy()
        values[:, :, :3] *= core[:, :, None]
        values[:, :, 3] = core
        for axis in (0, 1):
            pads = [(radius, radius) if i == axis else (0, 0) for i in range(3)]
            padded = np.pad(values, pads)
            values = sum(weight * np.take(padded, np.arange(values.shape[axis])+i, axis=axis)
                         for i, weight in enumerate(weights))
        rgb = values[:, :, :3] / np.maximum(values[:, :, 3:4], 1e-12)
        yy, xx = np.nonzero(mask)
        narrow = min(np.ptp(xx)+1, np.ptp(yy)+1) < 32
        replace = gutter if narrow else gutter & ~core
        replace &= values[:, :, 3] > 1e-6
        output[y0:y1, x0:x1, :3][replace] = rgb[replace]
    return output.ravel()
