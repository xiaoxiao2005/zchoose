"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_BG_DIR_NAME = void 0;
exports.getImagesDir = getImagesDir;
exports.getPresetBackgroundDir = getPresetBackgroundDir;
const path_1 = __importDefault(require("path"));
/**
 * 与 index 中 static 中间件使用的路径一致：frontend/public/images
 * 用于衣库图片、预设背景图等静态资源。
 */
function getImagesDir() {
    return path_1.default.join(__dirname, '../../frontend/public/images');
}
exports.PRESET_BG_DIR_NAME = '预设背景图';
function getPresetBackgroundDir() {
    return path_1.default.join(getImagesDir(), exports.PRESET_BG_DIR_NAME);
}
