// Same LAN IP / host as passenger App — update when testing on devices.
export const API_BASE_URL = 'http://10.33.77.224:5000/api';

export const socketOrigin = API_BASE_URL.replace(/\/api\/?$/i, '').trim();
