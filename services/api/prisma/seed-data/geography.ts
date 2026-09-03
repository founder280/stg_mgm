/**
 * Demonstration geography: a slice of Tamil Nadu around Thiruvannamalai, the
 * site of the Karthigai Deepam festival, plus the Cuddalore chain used as the
 * worked example in the form specification.
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
      code: 'TN',
      name: 'Tamil Nadu',
      nameLocal: 'தமிழ்நாடு',
      level: 'STATE',
      latitude: 11.1271,
      longitude: 78.6569,
      population: 72147030,
      children: [
        {
          code: 'TN-RGN-N',
          name: 'Northern Region',
          level: 'REGION',
          latitude: 12.4,
          longitude: 79.3,
          children: [
            {
              code: 'TN-TVM',
              name: 'Tiruvannamalai',
              nameLocal: 'திருவண்ணாமலை',
              level: 'DISTRICT',
              latitude: 12.2253,
              longitude: 79.0747,
              population: 2464875,
              children: [
                {
                  code: 'TN-TVM-TK1',
                  name: 'Tiruvannamalai',
                  nameLocal: 'திருவண்ணாமலை',
                  level: 'TALUK',
                  latitude: 12.2253,
                  longitude: 79.0747,
                  children: [
                    {
                      code: 'TN-TVM-V1',
                      name: 'Adiannamalai',
                      nameLocal: 'ஆதியண்ணாமலை',
                      level: 'VILLAGE',
                      latitude: 12.2361,
                      longitude: 79.0578,
                      population: 8200,
                      children: [
                        { code: 'TN-TVM-H1', name: 'Adiannamalai North', level: 'HAMLET', latitude: 12.2405, longitude: 79.0561, population: 3100 },
                        { code: 'TN-TVM-H2', name: 'Adiannamalai South', level: 'HAMLET', latitude: 12.2318, longitude: 79.0594, population: 5100 },
                      ],
                    },
                    {
                      code: 'TN-TVM-V2',
                      name: 'Perumbakkam',
                      nameLocal: 'பெரும்பாக்கம்',
                      level: 'VILLAGE',
                      latitude: 12.2035,
                      longitude: 79.0912,
                      population: 6400,
                      children: [
                        { code: 'TN-TVM-H3', name: 'Perumbakkam Kandigai', level: 'HAMLET', latitude: 12.2011, longitude: 79.0951, population: 2600 },
                        { code: 'TN-TVM-H4', name: 'Perumbakkam Colony', level: 'HAMLET', latitude: 12.2064, longitude: 79.0885, population: 3800 },
                      ],
                    },
                  ],
                },
                {
                  code: 'TN-TVM-TK2',
                  name: 'Kilpennathur',
                  nameLocal: 'கீழ்பென்னாத்தூர்',
                  level: 'TALUK',
                  latitude: 12.3167,
                  longitude: 79.2,
                  children: [
                    {
                      code: 'TN-TVM-V3',
                      name: 'Kilpennathur',
                      level: 'VILLAGE',
                      latitude: 12.3167,
                      longitude: 79.2,
                      population: 12000,
                      children: [
                        { code: 'TN-TVM-H5', name: 'Kilpennathur Main', level: 'HAMLET', latitude: 12.3175, longitude: 79.2019, population: 7000 },
                        { code: 'TN-TVM-H6', name: 'Melpennathur', level: 'HAMLET', latitude: 12.3241, longitude: 79.1902, population: 5000 },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              code: 'TN-CUD',
              name: 'Cuddalore',
              nameLocal: 'கடலூர்',
              level: 'DISTRICT',
              latitude: 11.748,
              longitude: 79.7714,
              population: 2605914,
              children: [
                {
                  code: 'TN-CUD-TK1',
                  name: 'Kattumannarkoil',
                  nameLocal: 'கட்டுமன்னார்கோயில்',
                  level: 'TALUK',
                  latitude: 11.4667,
                  longitude: 79.5667,
                  children: [
                    {
                      code: 'TN-CUD-V1',
                      name: 'Kozhai',
                      nameLocal: 'கோழை',
                      level: 'VILLAGE',
                      latitude: 11.4712,
                      longitude: 79.5621,
                      population: 4300,
                      children: [
                        // The example spelled out in the form specification:
                        // Tamil Nadu > Cuddalore > Kattumannarkoil > Kozhai > Srinedunchery
                        { code: 'TN-CUD-H1', name: 'Srinedunchery', nameLocal: 'ஸ்ரீநெடுஞ்சேரி', level: 'HAMLET', latitude: 11.4738, longitude: 79.5589, population: 1800 },
                        { code: 'TN-CUD-H2', name: 'Kozhai Kudiyiruppu', level: 'HAMLET', latitude: 11.4686, longitude: 79.5654, population: 2500 },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              code: 'TN-VLP',
              name: 'Villupuram',
              nameLocal: 'விழுப்புரம்',
              level: 'DISTRICT',
              latitude: 11.9401,
              longitude: 79.4861,
              population: 2093003,
              children: [
                {
                  code: 'TN-VLP-TK1',
                  name: 'Villupuram',
                  level: 'TALUK',
                  latitude: 11.9401,
                  longitude: 79.4861,
                  children: [
                    {
                      code: 'TN-VLP-V1',
                      name: 'Kappiyampuliyur',
                      level: 'VILLAGE',
                      latitude: 11.9612,
                      longitude: 79.4702,
                      population: 5200,
                      children: [
                        { code: 'TN-VLP-H1', name: 'Kappiyampuliyur East', level: 'HAMLET', latitude: 11.9634, longitude: 79.4738, population: 2400 },
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
    code: 'H-TVM-HUD1',
    name: 'Tiruvannamalai HUD',
    level: 'HUD',
    latitude: 12.2253,
    longitude: 79.0747,
    children: [
      {
        code: 'H-TVM-BLK1',
        name: 'Tiruvannamalai Block',
        level: 'BLOCK',
        latitude: 12.2253,
        longitude: 79.0747,
        children: [
          {
            code: 'H-TVM-PHC1',
            name: 'PHC Adiannamalai',
            level: 'PHC',
            latitude: 12.2361,
            longitude: 79.0578,
            children: [
              { code: 'H-TVM-HSC1', name: 'HSC Adiannamalai', level: 'HSC', latitude: 12.2405, longitude: 79.0561 },
              { code: 'H-TVM-HSC2', name: 'HSC Perumbakkam', level: 'HSC', latitude: 12.2035, longitude: 79.0912 },
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'H-CUD-HUD1',
    name: 'Chidambaram HUD',
    level: 'HUD',
    latitude: 11.3993,
    longitude: 79.6913,
    children: [
      {
        code: 'H-CUD-BLK1',
        name: 'Kattumannarkoil Block',
        level: 'BLOCK',
        latitude: 11.4667,
        longitude: 79.5667,
        children: [
          {
            code: 'H-CUD-PHC1',
            name: 'PHC Kozhai',
            level: 'PHC',
            latitude: 11.4712,
            longitude: 79.5621,
            children: [{ code: 'H-CUD-HSC1', name: 'HSC Srinedunchery', level: 'HSC', latitude: 11.4738, longitude: 79.5589 }],
          },
        ],
      },
    ],
  },
];

/** Festival zones — main divisions and sub-divisions of the gathering area. */
export const FESTIVAL_ZONES = [
  {
    code: 'Z-GIRI',
    name: 'Girivalam Path',
    latitude: 12.2253,
    longitude: 79.0747,
    expectedFootfall: 1200000,
    children: [
      { code: 'Z-GIRI-N', name: 'Girivalam North Sector', latitude: 12.2461, longitude: 79.0689, expectedFootfall: 380000 },
      { code: 'Z-GIRI-E', name: 'Girivalam East Sector', latitude: 12.2287, longitude: 79.0961, expectedFootfall: 340000 },
      { code: 'Z-GIRI-S', name: 'Girivalam South Sector', latitude: 12.2044, longitude: 79.0712, expectedFootfall: 290000 },
      { code: 'Z-GIRI-W', name: 'Girivalam West Sector', latitude: 12.2298, longitude: 79.0511, expectedFootfall: 190000 },
    ],
  },
  {
    code: 'Z-TEMPLE',
    name: 'Temple Precinct',
    latitude: 12.2312,
    longitude: 79.0672,
    expectedFootfall: 900000,
    children: [
      { code: 'Z-TEMPLE-Q', name: 'Darshan Queue Complex', latitude: 12.2318, longitude: 79.0665, expectedFootfall: 600000 },
      { code: 'Z-TEMPLE-M', name: 'Mada Streets', latitude: 12.2301, longitude: 79.0688, expectedFootfall: 300000 },
    ],
  },
  {
    code: 'Z-TRANSIT',
    name: 'Transit and Parking',
    latitude: 12.2131,
    longitude: 79.0821,
    expectedFootfall: 500000,
    children: [
      { code: 'Z-TRANSIT-BUS', name: 'Temporary Bus Stand', latitude: 12.2118, longitude: 79.0834, expectedFootfall: 300000 },
      { code: 'Z-TRANSIT-PARK', name: 'Vehicle Parking Grounds', latitude: 12.2149, longitude: 79.0798, expectedFootfall: 200000 },
    ],
  },
];
