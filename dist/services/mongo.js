/**
 * MongoDB connection singleton.
 *
 * Dedicated to memory-mcp only — a distinct deployment/database from the
 * separate MongoDB instance the credit-workflow project runs on the same VPS.
 * MONGODB_URI must point at that dedicated instance, never at the shared one.
 */
import { MongoClient } from 'mongodb';
let _client = null;
let _db = null;
function buildClient() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Missing required env var: MONGODB_URI');
    }
    return new MongoClient(uri);
}
/**
 * Returns the shared Db handle, connecting lazily on first use.
 * The MongoClient itself pools connections internally — callers should not
 * open a new client per request.
 */
export async function getMongoDb() {
    if (_db)
        return _db;
    const dbName = process.env.MONGODB_DB;
    if (!dbName) {
        throw new Error('Missing required env var: MONGODB_DB');
    }
    if (!_client) {
        _client = buildClient();
        await _client.connect();
    }
    _db = _client.db(dbName);
    return _db;
}
/** For graceful shutdown and tests. */
export async function closeMongoDb() {
    if (_client) {
        await _client.close();
        _client = null;
        _db = null;
    }
}
//# sourceMappingURL=mongo.js.map