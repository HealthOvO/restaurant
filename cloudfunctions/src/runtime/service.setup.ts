import { COLLECTIONS } from "@restaurant/shared";
import { cloud } from "./cloud";

function isCollectionAlreadyExistsError(error: unknown): boolean {
  const message = `${(error as { errMsg?: string; message?: string } | undefined)?.errMsg ?? (error as { message?: string } | undefined)?.message ?? ""}`.toLowerCase();
  return (
    message.includes("already exists") ||
    message.includes("table exist") ||
    message.includes("table exists") ||
    message.includes("collection exists")
  );
}

export async function initDatabaseCollections() {
  const db = cloud.database() as typeof cloud.database extends (...args: any[]) => infer T ? T : never;
  const collectionNames = Object.values(COLLECTIONS);
  const createdCollections: string[] = [];
  const existingCollections: string[] = [];

  for (const collectionName of collectionNames) {
    try {
      await (db as { createCollection: (name: string) => Promise<unknown> }).createCollection(collectionName);
      createdCollections.push(collectionName);
    } catch (error) {
      if (isCollectionAlreadyExistsError(error)) {
        existingCollections.push(collectionName);
        continue;
      }

      throw error;
    }
  }

  return {
    ok: true as const,
    createdCollections,
    existingCollections,
    totalCollections: collectionNames.length
  };
}
