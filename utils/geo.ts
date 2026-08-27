export type Coordinates = {
  latitude: number;
  longitude: number;
};

export function calculateDistanceMeters(
  userLatitude: number,
  userLongitude: number,
  placeLatitude: number,
  placeLongitude: number
) {
  const earthRadiusMeters = 6_371_000;
  const userLatRadians = toRadians(userLatitude);
  const placeLatRadians = toRadians(placeLatitude);
  const deltaLatitude = toRadians(placeLatitude - userLatitude);
  const deltaLongitude = toRadians(placeLongitude - userLongitude);
  const sinLatitude = Math.sin(deltaLatitude / 2);
  const sinLongitude = Math.sin(deltaLongitude / 2);
  const haversine =
    sinLatitude * sinLatitude +
    Math.cos(userLatRadians) * Math.cos(placeLatRadians) * sinLongitude * sinLongitude;

  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

function toRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
