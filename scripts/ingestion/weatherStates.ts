import { states } from "../../lib/states";

export const WEATHER_EXCLUDED_STATE_IDS = new Set(["11"]);

export const weatherStates = states.filter((state) => !WEATHER_EXCLUDED_STATE_IDS.has(state.id));

export const weatherStateIds = weatherStates.map((state) => state.id);

export const weatherStateIdSet = new Set(weatherStateIds);

export const WEATHER_EXPECTED_STATE_COUNT = weatherStates.length;
