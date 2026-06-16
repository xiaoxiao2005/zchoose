"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addOutfitRecord = addOutfitRecord;
const init_1 = require("../db/init");
/**
 * 记录一次穿搭选择（试衣或选择推荐时调用）
 */
function addOutfitRecord(userId, outfitId, options) {
    init_1.db.prepare('INSERT INTO outfit_records (user_id, outfit_id, occasion, weather_temp, weather_desc) VALUES (?, ?, ?, ?, ?)').run(userId, outfitId, options?.occasion ?? null, options?.weatherTemp ?? null, options?.weatherDesc ?? null);
}
