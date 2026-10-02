/**
 * The four projects the index names, in the order it names them.
 *
 * `company` is the folder under media/heroSection, so a project can never show
 * work that is not in the library; everything else here is what the project
 * page prints around that work. `category` is the credit — the roles held on
 * that job — printed under the title and on the next-project card. One list,
 * read by the API and by the index, so a client cannot be renamed in one place
 * and not the other.
 */
export const PROJECTS = [
  {
    slug: "mynuuk",
    company: "MYNUUK",
    name: "LAMA × Mynuuk",
    category: "Event / Creative Direction / DP / Editor",
    year: "2025",
    place: "New Delhi"
  },
  {
    slug: "swatch-ap",
    company: "SWATCH X AP",
    name: "LAMA × Swatch × AP",
    category: "Direction / DP / Editor",
    year: "2025",
    place: "New Delhi"
  },
  {
    slug: "gully-labs",
    company: "GULLY LABS",
    name: "LAMA × Gully Labs",
    category: "Event / Creative Direction / DP / Editor",
    year: "2025",
    place: "New Delhi"
  },
  {
    slug: "moxie",
    company: "MOXIE",
    name: "LAMA × Moxie",
    category: "Direction / DP / Editor",
    year: "2025",
    place: "New Delhi"
  }
];

/** Folder names are shouted ("GULLY LABS"); matching should not care. */
export function companyKey(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/**
 * The projects, each carrying its own media in library order — films first so
 * a page opens on motion, then stills.
 */
export function groupProjects(items) {
  const byCompany = new Map();
  for (const item of items) {
    const key = companyKey(item.company);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(item);
  }

  return PROJECTS.map((project, i) => {
    const mine = byCompany.get(companyKey(project.company)) || [];
    return {
      ...project,
      num: String(i + 1).padStart(2, "0"),
      films: mine.filter((m) => m.type === "video").length,
      stills: mine.filter((m) => m.type === "image").length,
      items: mine
    };
  });
}
