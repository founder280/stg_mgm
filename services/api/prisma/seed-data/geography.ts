/**
 * Demonstration geography: a slice of Telangana around Medaram in Mulugu
 * district, the site of the Sammakka–Saralamma Jatara, plus the neighbouring
 * districts pilgrims arrive through and the one that receives the referrals.
 *
 * Coordinates are approximate real locations so the dashboard map, the
 * distance maths and the spatial scan all behave realistically.
 */

export interface SeedUnit {
  code: string;
  name: string;
  nameLocal?: string;
  level: string;
  latitude?: number;
  longitude?: number;
  population?: number;
  children?: SeedUnit[];
}

export const INDIA: SeedUnit = {
  code: 'IN',
  name: 'India',
  level: 'COUNTRY',
  latitude: 22.35,
  longitude: 78.67,
  children: [
    {
      code: 'TG',
      name: 'Telangana',
      nameLocal: 'తెలంగాణ',
      level: 'STATE',
      latitude: 17.9784,
      longitude: 79.5941,
      population: 35193978,
      children: [
        {
          // Regions are a configurable master, not a fixed administrative
          // division of the state. This one groups the three districts the
          // Jatara is run across, which is how the health department staffs it.
          code: 'TG-RGN-WGL',
          name: 'Warangal Region',
          level: 'REGION',
          latitude: 18.1,
          longitude: 79.8,
          children: [
            {
              code: 'TG-MLG',
              name: 'Mulugu',
              nameLocal: 'ములుగు',
              level: 'DISTRICT',
              latitude: 18.195,
              longitude: 79.94,
              population: 294671,
              children: [
                {
                  code: 'TG-MLG-M1',
                  name: 'Tadvai',
                  nameLocal: 'తాడ్వాయి',
                  level: 'MANDAL',
                  latitude: 18.3644,
                  longitude: 80.0906,
                  children: [
                    {
                      code: 'TG-MLG-V1',
                      name: 'Medaram',
                      nameLocal: 'మేడారం',
                      level: 'VILLAGE',
                      latitude: 18.2969,
                      longitude: 80.2478,
                      population: 1400,
                      children: [
                        { code: 'TG-MLG-H1', name: 'Medaram Thanda', level: 'HAMLET', latitude: 18.3011, longitude: 80.2441, population: 600 },
                        { code: 'TG-MLG-H2', name: 'Chinna Medaram', level: 'HAMLET', latitude: 18.2921, longitude: 80.2519, population: 800 },
                      ],
                    },
                    {
                      code: 'TG-MLG-V2',
                      name: 'Narlapur',
                      nameLocal: 'నార్లాపూర్',
                      level: 'VILLAGE',
                      latitude: 18.3183,
                      longitude: 80.2169,
                      population: 2400,
                      children: [
                        { code: 'TG-MLG-H3', name: 'Narlapur Gutta', level: 'HAMLET', latitude: 18.3221, longitude: 80.2131, population: 900 },
                        { code: 'TG-MLG-H4', name: 'Narlapur Colony', level: 'HAMLET', latitude: 18.3152, longitude: 80.2204, population: 1500 },
                      ],
                    },
                  ],
                },
                {
                  code: 'TG-MLG-M2',
                  name: 'Govindaraopet',
                  nameLocal: 'గోవిందరావుపేట',
                  level: 'MANDAL',
                  latitude: 18.2069,
                  longitude: 80.0472,
                  children: [
                    {
                      code: 'TG-MLG-V3',
                      name: 'Pasra',
                      nameLocal: 'పస్రా',
                      level: 'VILLAGE',
                      latitude: 18.2361,
                      longitude: 80.0894,
                      population: 3800,
                      children: [
                        { code: 'TG-MLG-H5', name: 'Pasra Main', level: 'HAMLET', latitude: 18.2374, longitude: 80.0911, population: 2200 },
                        { code: 'TG-MLG-H6', name: 'Bandarupalli', level: 'HAMLET', latitude: 18.2302, longitude: 80.0839, population: 1600 },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              code: 'TG-JSB',
              name: 'Jayashankar Bhupalpally',
              nameLocal: 'జయశంకర్ భూపాలపల్లి',
              level: 'DISTRICT',
              latitude: 18.4333,
              longitude: 79.8667,
              population: 416763,
              children: [
                {
                  code: 'TG-JSB-M1',
                  name: 'Bhupalpally',
                  nameLocal: 'భూపాలపల్లి',
                  level: 'MANDAL',
                  latitude: 18.4333,
                  longitude: 79.8667,
                  children: [
                    {
                      code: 'TG-JSB-V1',
                      name: 'Chelpur',
                      nameLocal: 'చెల్పూర్',
                      level: 'VILLAGE',
                      latitude: 18.4831,
                      longitude: 79.9297,
                      population: 14200,
                      children: [
                        // The example chain used throughout the form
                        // documentation: Telangana > Jayashankar Bhupalpally >
                        // Bhupalpally > Chelpur > Singareni Colony.
                        { code: 'TG-JSB-H1', name: 'Singareni Colony', nameLocal: 'సింగరేణి కాలనీ', level: 'HAMLET', latitude: 18.4867, longitude: 79.9264, population: 6100 },
                        { code: 'TG-JSB-H2', name: 'Chelpur Bazar', level: 'HAMLET', latitude: 18.4802, longitude: 79.9331, population: 4400 },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              code: 'TG-WGL',
              name: 'Warangal',
              nameLocal: 'వరంగల్',
              level: 'DISTRICT',
              latitude: 17.9689,
              longitude: 79.5941,
              population: 1080858,
              children: [
                {
                  code: 'TG-WGL-M1',
                  name: 'Hanamkonda',
                  nameLocal: 'హనుమకొండ',
                  level: 'MANDAL',
                  latitude: 18.0,
                  longitude: 79.56,
                  children: [
                    {
                      code: 'TG-WGL-V1',
                      name: 'Kazipet',
                      nameLocal: 'కాజీపేట',
                      level: 'VILLAGE',
                      latitude: 17.95,
                      longitude: 79.5167,
                      population: 65000,
                      children: [
                        { code: 'TG-WGL-H1', name: 'Kazipet Railway Colony', level: 'HAMLET', latitude: 17.9542, longitude: 79.5121, population: 12000 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/**
 * Health hierarchy over the same districts:
 * District > HUD > Block > PHC > HSC. Villages hang off the HSC.
 */
export const HEALTH_UNITS: SeedUnit[] = [
  {
    code: 'H-MLG-HUD1',
    name: 'Mulugu HUD',
    level: 'HUD',
    latitude: 18.195,
    longitude: 79.94,
    children: [
      {
        code: 'H-MLG-BLK1',
        name: 'Tadvai Block',
        level: 'BLOCK',
        latitude: 18.3644,
        longitude: 80.0906,
        children: [
          {
            code: 'H-MLG-PHC1',
            name: 'PHC Medaram',
            level: 'PHC',
            latitude: 18.2969,
            longitude: 80.2478,
            children: [
              { code: 'H-MLG-HSC1', name: 'HSC Medaram', level: 'HSC', latitude: 18.3011, longitude: 80.2441 },
              { code: 'H-MLG-HSC2', name: 'HSC Narlapur', level: 'HSC', latitude: 18.3183, longitude: 80.2169 },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'H-JSB-HUD1',
    name: 'Bhupalpally HUD',
    level: 'HUD',
    latitude: 18.4333,
    longitude: 79.8667,
    children: [
      {
        code: 'H-JSB-BLK1',
        name: 'Bhupalpally Block',
        level: 'BLOCK',
        latitude: 18.4333,
        longitude: 79.8667,
        children: [
          {
            code: 'H-JSB-PHC1',
            name: 'PHC Chelpur',
            level: 'PHC',
            latitude: 18.4831,
            longitude: 79.9297,
            children: [{ code: 'H-JSB-HSC1', name: 'HSC Singareni Colony', level: 'HSC', latitude: 18.4867, longitude: 79.9264 }],
          },
        ],
      },
    ],
  },
];

/** Jatara zones — main divisions and sub-divisions of the gathering area. */
export const FESTIVAL_ZONES = [
  {
    code: 'Z-JATARA',
    name: 'Jatara Grounds',
    latitude: 18.2969,
    longitude: 80.2478,
    expectedFootfall: 1200000,
    children: [
      { code: 'Z-JAT-N', name: 'Jatara North Sector', latitude: 18.3061, longitude: 80.2452, expectedFootfall: 380000 },
      { code: 'Z-JAT-E', name: 'Jatara East Sector', latitude: 18.2981, longitude: 80.2604, expectedFootfall: 340000 },
      { code: 'Z-JAT-S', name: 'Jatara South Sector', latitude: 18.2848, longitude: 80.2461, expectedFootfall: 290000 },
      { code: 'Z-JAT-W', name: 'Jatara West Sector', latitude: 18.2991, longitude: 80.2331, expectedFootfall: 190000 },
    ],
  },
  {
    code: 'Z-GADDE',
    name: 'Gadde Precinct',
    latitude: 18.2952,
    longitude: 80.2489,
    expectedFootfall: 900000,
    children: [
      { code: 'Z-GADDE-S', name: 'Sammakka Gadde Queue', latitude: 18.2958, longitude: 80.2482, expectedFootfall: 600000 },
      { code: 'Z-GADDE-R', name: 'Saralamma Gadde', latitude: 18.2941, longitude: 80.2497, expectedFootfall: 300000 },
    ],
  },
  {
    code: 'Z-JAMPANNA',
    name: 'Jampanna Vagu and Transit',
    latitude: 18.2891,
    longitude: 80.2551,
    expectedFootfall: 500000,
    children: [
      { code: 'Z-JAMP-GHAT', name: 'Jampanna Vagu Bathing Ghats', latitude: 18.2878, longitude: 80.2564, expectedFootfall: 300000 },
      { code: 'Z-JAMP-PARK', name: 'Vehicle Parking and Bus Stand', latitude: 18.2909, longitude: 80.2528, expectedFootfall: 200000 },
    ],
  },
];
