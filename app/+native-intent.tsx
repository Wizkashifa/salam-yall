export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  if (path.includes("/share/event/") || path.includes("/share/restaurant/") || path.includes("/share/business/")) {
    return "/";
  }
  if (path.startsWith("salamyall://")) {
    return "/";
  }
  return path || "/";
}
