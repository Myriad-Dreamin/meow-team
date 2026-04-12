import type { TeamRepositoryPickerModel } from "@/lib/team/repository-picker";

export type TeamConsoleRepositorySelection = {
  repositoryId: string;
  source: "auto" | "manual";
};

export const getDefaultTeamConsoleRepositoryId = (
  repositoryPicker: TeamRepositoryPickerModel,
): string => repositoryPicker.suggestedRepositories[0]?.id ?? "";

export const createAutoTeamConsoleRepositorySelection = (
  repositoryPicker: TeamRepositoryPickerModel,
): TeamConsoleRepositorySelection => ({
  repositoryId: getDefaultTeamConsoleRepositoryId(repositoryPicker),
  source: "auto",
});

export const createManualTeamConsoleRepositorySelection = (
  repositoryId: string,
): TeamConsoleRepositorySelection => ({
  repositoryId,
  source: "manual",
});

export const applyRequestedTeamConsoleRepositorySelection = (
  currentSelection: TeamConsoleRepositorySelection,
  repositoryId: string | undefined,
): TeamConsoleRepositorySelection =>
  repositoryId ? createManualTeamConsoleRepositorySelection(repositoryId) : currentSelection;

export const reconcileTeamConsoleRepositorySelection = (
  currentSelection: TeamConsoleRepositorySelection,
  repositoryPicker: TeamRepositoryPickerModel,
): TeamConsoleRepositorySelection => {
  const repositoryStillExists =
    currentSelection.repositoryId !== "" &&
    repositoryPicker.orderedRepositories.some(
      (repository) => repository.id === currentSelection.repositoryId,
    );

  if (repositoryStillExists) {
    return currentSelection;
  }

  if (currentSelection.source === "manual" && currentSelection.repositoryId === "") {
    return currentSelection;
  }

  return createAutoTeamConsoleRepositorySelection(repositoryPicker);
};
