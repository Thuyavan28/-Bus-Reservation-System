// [name, state, lat, lng, aliases]. City centres (approximate). Main hubs with custom boarding points live in seed.ts.
export const PLACES: [string, string, number, number, string[]][] = [
  // Tamil Nadu
  ['Chennai', 'Tamil Nadu', 13.0827, 80.2707, ['madras']],
  ['Coimbatore', 'Tamil Nadu', 11.0168, 76.9558, ['kovai']],
  ['Madurai', 'Tamil Nadu', 9.9252, 78.1198, []],
  ['Trichy', 'Tamil Nadu', 10.7905, 78.7047, ['tiruchirappalli', 'tiruchi', 'trichirappalli']],
  ['Salem', 'Tamil Nadu', 11.6643, 78.146, []],
  ['Tirunelveli', 'Tamil Nadu', 8.7139, 77.7567, ['nellai']],
  ['Erode', 'Tamil Nadu', 11.341, 77.7172, []],
  ['Vellore', 'Tamil Nadu', 12.9165, 79.1325, []],
  ['Thanjavur', 'Tamil Nadu', 10.787, 79.1378, ['tanjore']],
  ['Tiruppur', 'Tamil Nadu', 11.1085, 77.3411, ['tirupur']],
  ['Nagercoil', 'Tamil Nadu', 8.1833, 77.4119, []],
  ['Kanyakumari', 'Tamil Nadu', 8.0883, 77.5385, ['cape comorin']],
  ['Hosur', 'Tamil Nadu', 12.7409, 77.8253, []],
  ['Dindigul', 'Tamil Nadu', 10.3673, 77.9803, []],
  ['Karur', 'Tamil Nadu', 10.9601, 78.0766, []],
  ['Namakkal', 'Tamil Nadu', 11.2189, 78.1677, []],
  ['Puducherry', 'Puducherry', 11.9416, 79.8083, ['pondicherry', 'pondy']],
  ['Cuddalore', 'Tamil Nadu', 11.748, 79.7714, []],
  ['Kumbakonam', 'Tamil Nadu', 10.9617, 79.3881, []],
  ['Ooty', 'Tamil Nadu', 11.4102, 76.695, ['udhagamandalam', 'udagamandalam']],
  ['Kodaikanal', 'Tamil Nadu', 10.2381, 77.4892, []],
  ['Rameswaram', 'Tamil Nadu', 9.2876, 79.3129, []],
  ['Thoothukudi', 'Tamil Nadu', 8.7642, 78.1348, ['tuticorin']],
  ['Sivakasi', 'Tamil Nadu', 9.4533, 77.7979, []],
  ['Virudhunagar', 'Tamil Nadu', 9.568, 77.9624, []],
  ['Tiruvannamalai', 'Tamil Nadu', 12.2253, 79.0747, []],
  ['Krishnagiri', 'Tamil Nadu', 12.5266, 78.215, []],
  ['Dharmapuri', 'Tamil Nadu', 12.1211, 78.1582, []],
  ['Pollachi', 'Tamil Nadu', 10.6609, 77.0048, []],
  ['Palani', 'Tamil Nadu', 10.45, 77.5167, []],
  ['Chidambaram', 'Tamil Nadu', 11.3993, 79.6933, []],
  ['Villupuram', 'Tamil Nadu', 11.9401, 79.4861, []],
  ['Karaikudi', 'Tamil Nadu', 10.0735, 78.78, []],
  ['Pudukkottai', 'Tamil Nadu', 10.3797, 78.8208, []],
  ['Theni', 'Tamil Nadu', 10.0104, 77.4768, []],
  ['Kancheepuram', 'Tamil Nadu', 12.8342, 79.7036, ['kanchipuram']],
  ['Tenkasi', 'Tamil Nadu', 8.9594, 77.3152, []],
  // Karnataka
  ['Bengaluru', 'Karnataka', 12.9716, 77.5946, ['bangalore', 'blr']],
  ['Mysuru', 'Karnataka', 12.2958, 76.6394, ['mysore']],
  ['Mangaluru', 'Karnataka', 12.9141, 74.856, ['mangalore']],
  ['Hubballi', 'Karnataka', 15.3647, 75.124, ['hubli']],
  ['Belagavi', 'Karnataka', 15.8497, 74.4977, ['belgaum']],
  ['Davangere', 'Karnataka', 14.4644, 75.9218, []],
  ['Shivamogga', 'Karnataka', 13.9299, 75.5681, ['shimoga']],
  ['Udupi', 'Karnataka', 13.3409, 74.7421, []],
  ['Hassan', 'Karnataka', 13.0072, 76.0962, []],
  ['Tumakuru', 'Karnataka', 13.3379, 77.1173, ['tumkur']],
  ['Kalaburagi', 'Karnataka', 17.3297, 76.8343, ['gulbarga']],
  ['Ballari', 'Karnataka', 15.1394, 76.9214, ['bellary']],
  ['Madikeri', 'Karnataka', 12.4244, 75.7382, ['coorg']],
  ['Chikkamagaluru', 'Karnataka', 13.3161, 75.772, ['chikmagalur']],
  // Kerala
  ['Kochi', 'Kerala', 9.9312, 76.2673, ['cochin', 'ernakulam']],
  ['Thiruvananthapuram', 'Kerala', 8.5241, 76.9366, ['trivandrum', 'tvm']],
  ['Kozhikode', 'Kerala', 11.2588, 75.7804, ['calicut']],
  ['Thrissur', 'Kerala', 10.5276, 76.2144, ['trichur']],
  ['Kollam', 'Kerala', 8.8932, 76.6141, ['quilon']],
  ['Alappuzha', 'Kerala', 9.4981, 76.3388, ['alleppey']],
  ['Kottayam', 'Kerala', 9.5916, 76.5222, []],
  ['Palakkad', 'Kerala', 10.7867, 76.6548, ['palghat']],
  ['Kannur', 'Kerala', 11.8745, 75.3704, ['cannanore']],
  ['Kasaragod', 'Kerala', 12.4996, 74.9869, []],
  ['Malappuram', 'Kerala', 11.051, 76.0711, []],
  ['Munnar', 'Kerala', 10.0889, 77.0595, []],
  ['Pathanamthitta', 'Kerala', 9.2648, 76.787, []],
  ['Guruvayur', 'Kerala', 10.5943, 76.041, []],
  ['Kalpetta', 'Kerala', 11.6103, 76.083, ['wayanad']],
  // Andhra Pradesh / Telangana
  ['Tirupati', 'Andhra Pradesh', 13.6288, 79.4192, []],
  ['Hyderabad', 'Telangana', 17.385, 78.4867, []],
  ['Vijayawada', 'Andhra Pradesh', 16.5062, 80.648, []],
];

/** Service area for Groq-geocoded places: South India incl. Hyderabad. */
export const SERVICE_BOX = { minLat: 7.5, maxLat: 19.5, minLng: 72.5, maxLng: 82.5 };

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
