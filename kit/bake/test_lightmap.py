"""Run with Blender -b --python kit/bake/test_lightmap.py."""
import os
import sys
import unittest
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from lightmap import filter_lightmap


class LightmapFilterTests(unittest.TestCase):
    def region(self):
        mask = np.zeros((24, 10), dtype=bool)
        mask[4:20, 4:6] = True
        gutter = np.zeros_like(mask)
        gutter[2:22, 2:8] = True
        return (np.array([4, 4]), np.array([14, 28]), mask, gutter)

    def test_neighbouring_atlas_colours_cannot_contaminate_a_constant_strip(self):
        pixels = np.full((32, 32, 4), 100, dtype=np.float32)
        pixels[:, :, 3] = 1
        pixels[8:24, 8:10, :3] = [.2, .4, .8]
        result = filter_lightmap(pixels.ravel(), 32, [self.region()]).reshape(32, 32, 4)
        np.testing.assert_allclose(result[6:26, 6:12, :3], np.broadcast_to([.2, .4, .8], (20, 6, 3)), atol=1e-6)
        np.testing.assert_array_equal(result[0:4], pixels[0:4])
        np.testing.assert_array_equal(result[:, :, 3], pixels[:, :, 3])

    def test_filter_reduces_strip_noise_without_changing_the_rest_of_the_atlas(self):
        pixels = np.ones((32, 32, 4), dtype=np.float32)
        pixels[8:24:2, 8:10, :3] = .5
        pixels[9:24:2, 8:10, :3] = 1.5
        result = filter_lightmap(pixels.ravel(), 32, [self.region()]).reshape(32, 32, 4)
        self.assertLess(result[10:22, 8:10, :3].std(), .05)
        np.testing.assert_array_equal(result[:, 16:], pixels[:, 16:])

    def test_no_narrow_charts_leaves_broad_surfaces_unchanged(self):
        pixels = np.random.default_rng(0).random(32*32*4).astype(np.float32)
        np.testing.assert_array_equal(filter_lightmap(pixels, 32, []), pixels)

    def test_bright_boundary_samples_are_replaced_without_blurring_broad_interior(self):
        pixels = np.full((64, 64, 4), 100, dtype=np.float32)
        pixels[:, :, 3] = 1
        pixels[14:50, 14:50, :3] = .4
        pixels[25, 25, :3] = .7
        mask = np.zeros((48, 48), dtype=bool)
        mask[4:44, 4:44] = True
        gutter = np.zeros_like(mask)
        gutter[2:46, 2:46] = True
        region = (np.array([8, 8]), np.array([56, 56]), mask, gutter)
        result = filter_lightmap(pixels.ravel(), 64, [region]).reshape(64, 64, 4)
        np.testing.assert_allclose(result[12:14, 20:40, :3], .4, atol=1e-6)
        np.testing.assert_array_equal(result[14:50, 14:50], pixels[14:50, 14:50])


unittest.main(argv=[__file__])
