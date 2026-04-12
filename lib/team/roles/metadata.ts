export type TeamRoleDefinition = {
  id: string;
  name: string;
  summary: string;
  filePath: string;
};

const readFrontmatterString = (
  frontmatter: Record<string, unknown>,
  key: string,
): string | null => {
  const value = frontmatter[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const titleizeRoleId = (roleId: string): string => {
  return roleId
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

export const createTeamRoleDefinition = ({
  roleId,
  filePath,
  frontmatter,
}: {
  roleId: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
}): TeamRoleDefinition => {
  return {
    id: roleId,
    name: readFrontmatterString(frontmatter, "title") ?? titleizeRoleId(roleId),
    summary: readFrontmatterString(frontmatter, "summary") ?? "No summary provided.",
    filePath,
  };
};
