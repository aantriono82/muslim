export const shouldPersistPrefetchStamp = (
  results: PromiseSettledResult<unknown>[],
) => {
  return results.some((result) => result.status === "fulfilled");
};
