/**
 * MongoDB connection singleton.
 *
 * Dedicated to memory-mcp only — a distinct deployment/database from the
 * separate MongoDB instance the credit-workflow project runs on the same VPS.
 * MONGODB_URI must point at that dedicated instance, never at the shared one.
 */
import { type Db } from 'mongodb';
/**
 * Returns the shared Db handle, connecting lazily on first use.
 * The MongoClient itself pools connections internally — callers should not
 * open a new client per request.
 */
export declare function getMongoDb(): Promise<Db>;
/** For graceful shutdown and tests. */
export declare function closeMongoDb(): Promise<void>;
//# sourceMappingURL=mongo.d.ts.map