import { useCallback, useEffect, useState } from "react";
import { isDifficulty, type Difficulty } from "../../shared/game/difficulty.js";
import type { LevelSuggestion } from "../../shared/game/library.js";
import type { library } from "../game/libraryClient.js";

export type SetupInfoClient = Pick<typeof library, "suggestion" | "stats">;
const emptyLevels: Difficulty[] = [];

function useProfileValue<T>(
  profileId: string | undefined,
  load: (id: string) => Promise<T>,
  empty: T,
): [T, (value: T) => void] {
  const [owned, setOwned] = useState<{ profileId: string; value: T }>();
  useEffect(() => {
    if (!profileId) return;
    let active = true;
    void load(profileId)
      .then((value) => {
        if (active) setOwned({ profileId, value });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      setOwned(undefined);
    };
  }, [profileId, load]);
  const set = useCallback(
    (value: T) => {
      if (profileId) setOwned({ profileId, value });
    },
    [profileId],
  );
  return [owned && owned.profileId === profileId ? owned.value : empty, set];
}

export function useSetupInfo(
  profileId: string | undefined,
  client: SetupInfoClient,
): {
  suggestion: LevelSuggestion | null;
  beatenLevels: Difficulty[];
  suggestionAnswered: () => void;
} {
  const loadSuggestion = useCallback(
    (id: string) => client.suggestion(id),
    [client],
  );
  const loadBeaten = useCallback(
    (id: string) =>
      client.stats(id).then((stats) =>
        stats.levels
          .filter((item) => item.wins > 0)
          .map((item) => item.level)
          .filter(isDifficulty),
      ),
    [client],
  );
  const [suggestion, setSuggestion] = useProfileValue(
    profileId,
    loadSuggestion,
    null,
  );
  const [beatenLevels] = useProfileValue(profileId, loadBeaten, emptyLevels);
  return {
    suggestion,
    beatenLevels,
    suggestionAnswered: () => setSuggestion(null),
  };
}
