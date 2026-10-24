import { ExitSelector, ExitSelectorCity } from '../bridge/commands';
import { PinnedLocation } from '../common/appContext';
import { Exit, getContinent, getExitCountry } from './api';

/** returns a sort comparator for Exit[] given some parameters */
export function exitsSortComparator(left: Exit, right: Exit): number {
  const leftCountry = getExitCountry(left);
  const rightCountry = getExitCountry(right);

  const leftContinent = getContinent(leftCountry);
  const rightContinent = getContinent(rightCountry);

  const leftCountryName = leftCountry.name;
  const rightCountryName = rightCountry.name;

  return continentCmp(leftContinent, rightContinent) || leftCountryName.localeCompare(rightCountryName) || left.city_name.localeCompare(right.city_name) || left.id.localeCompare(right.id);
}

const continentRankings = [
    'NA',
    'EU',
    'SA',
    'AS',
    'AF',
    'OC',
    'AN',
];

export function continentCmp(left: string, right: string): number {
    return continentRankings.indexOf(left) - continentRankings.indexOf(right);
}

export function exitLocation(exit: Exit): PinnedLocation {
  let {city_code, country_code} = exit;
  return {
    city_code,
    country_code,
    pinned_at: 0,
  };
}

/** The only country this build offers exits in. */
export const ALLOWED_COUNTRY = 'GB';

export function isAllowedLocation(loc: { country_code: string }): boolean {
  return loc.country_code.toUpperCase() === ALLOWED_COUNTRY;
}

/** True when the selector can only reach an allowed exit: a UK city, or the UK itself. */
export function isAllowedSelector(exit: ExitSelector): boolean {
  if ('city' in exit) return isAllowedLocation(exit.city);
  if ('country' in exit) return isAllowedLocation(exit.country);
  return false;
}

export function exitCityEquals(left?: ExitSelectorCity, right?: ExitSelectorCity): boolean {
  if (left === undefined || right === undefined) return false;
  return left.country_code === right.country_code && left.city_code === right.city_code;
}
