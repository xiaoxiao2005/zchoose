"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnergy = getEnergy;
exports.addEnergy = addEnergy;
const init_1 = require("../db/init");
function ensureEnergy(userId) {
    const row = init_1.db.prepare('SELECT user_id FROM user_energy WHERE user_id = ?').get(userId);
    if (!row) {
        init_1.db.prepare('INSERT INTO user_energy (user_id, energy, updated_at) VALUES (?, 0, datetime("now"))').run(userId);
    }
}
function getEnergy(userId) {
    ensureEnergy(userId);
    const row = init_1.db.prepare('SELECT energy FROM user_energy WHERE user_id = ?').get(userId);
    return row?.energy ?? 0;
}
function addEnergy(userId, delta) {
    ensureEnergy(userId);
    if (delta <= 0)
        return getEnergy(userId);
    init_1.db.prepare('UPDATE user_energy SET energy = energy + ?, updated_at = datetime("now") WHERE user_id = ?').run(delta, userId);
    return getEnergy(userId);
}
