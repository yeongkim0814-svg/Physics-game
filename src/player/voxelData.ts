import voxelJson from '../assets/protagonist_voxels.json';
import type { VoxelFile } from './voxelCodec';

/** 사용자 도면에서 scripts/carve_character.py 가 만든 복셀 에셋 (docs/CHARACTER_ASSETS.md) */
export const VOXEL_FILE = voxelJson as unknown as VoxelFile;
