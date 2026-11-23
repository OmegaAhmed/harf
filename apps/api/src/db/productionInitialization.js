export function assertProductionInitializationTarget({
  databaseName,
  confirmedDatabaseName,
  collectionsWithData = []
}) {
  if (!databaseName) {
    throw new Error('MONGODB_DATABASE must be set before production initialization.');
  }
  if (databaseName === 'harf_experimental') {
    throw new Error('Production initialization cannot target harf_experimental.');
  }
  if (confirmedDatabaseName !== databaseName) {
    throw new Error('Pass --confirm-database with the exact MONGODB_DATABASE value to proceed.');
  }
  if (collectionsWithData.length) {
    throw new Error(`Production initialization stopped because the database is not empty: ${collectionsWithData.join(', ')}.`);
  }
}
