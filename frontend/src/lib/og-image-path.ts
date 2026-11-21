const imageNames = {
  cars: "opengraph-image-1jvhdk",
  circuits: "opengraph-image-1v12ae",
  drivers: "opengraph-image-1wf1s9",
  manufacturers: "opengraph-image-1t28pq",
  races: "opengraph-image-1q700l",
  teams: "opengraph-image-ke0wwa",
} as const;

/** Keep the existing image URLs shared across languages and season views. */
export function ogImagePath(path: string): string {
  const [, section, id] = path.split("/");
  if (!id || !Object.hasOwn(imageNames, section)) return "/opengraph-image";
  return `/${section}/${id}/${imageNames[section as keyof typeof imageNames]}`;
}
