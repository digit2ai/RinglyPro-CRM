// US Cities by State - Top cities for Business Collector
// Organized by state with major metropolitan and business-rich cities

const US_CITIES_BY_STATE = {
    'Florida': [
        'Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale',
        'St. Petersburg', 'Tallahassee', 'Cape Coral', 'Port St. Lucie',
        'Pembroke Pines', 'Hollywood', 'Miramar', 'Coral Springs',
        'Clearwater', 'Palm Bay', 'Lakeland', 'Pompano Beach', 'West Palm Beach',
        'Boca Raton', 'Gainesville', 'Fort Myers', 'Daytona Beach', 'Sarasota',
        'Kissimmee', 'Naples', 'Deerfield Beach', 'Boynton Beach', 'Delray Beach',
        'Melbourne', 'Ocala', 'Pensacola', 'Brandon', 'Spring Hill', 'Largo'
    ],
    'Texas': [
        'Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth',
        'El Paso', 'Arlington', 'Corpus Christi', 'Plano', 'Laredo',
        'Lubbock', 'Irving', 'Garland', 'Frisco', 'McKinney',
        'Amarillo', 'Grand Prairie', 'Brownsville', 'Pasadena', 'Mesquite',
        'Killeen', 'McAllen', 'Waco', 'Carrollton', 'Pearland',
        'Denton', 'Midland', 'Abilene', 'Round Rock', 'The Woodlands',
        'Richardson', 'Tyler', 'College Station', 'Lewisville', 'Sugar Land'
    ],
    'California': [
        'Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno',
        'Sacramento', 'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim',
        'Santa Ana', 'Riverside', 'Stockton', 'Irvine', 'Chula Vista',
        'Fremont', 'San Bernardino', 'Modesto', 'Fontana', 'Oxnard',
        'Moreno Valley', 'Huntington Beach', 'Glendale', 'Santa Clarita', 'Garden Grove',
        'Oceanside', 'Rancho Cucamonga', 'Santa Rosa', 'Ontario', 'Elk Grove',
        'Corona', 'Lancaster', 'Palmdale', 'Salinas', 'Hayward', 'Pomona',
        'Sunnyvale', 'Escondido', 'Pasadena', 'Torrance', 'Orange', 'Fullerton',
        'Thousand Oaks', 'Visalia', 'Simi Valley', 'Concord', 'Roseville'
    ],
    'New York': [
        'New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse',
        'Albany', 'New Rochelle', 'Mount Vernon', 'Schenectady', 'Utica',
        'White Plains', 'Hempstead', 'Troy', 'Niagara Falls', 'Binghamton',
        'Freeport', 'Valley Stream', 'Long Beach', 'Spring Valley', 'Levittown',
        'Poughkeepsie', 'West Seneca', 'Cheektowaga', 'West Babylon', 'Hicksville'
    ],
    'Georgia': [
        'Atlanta', 'Augusta', 'Columbus', 'Macon', 'Savannah',
        'Athens', 'Sandy Springs', 'Roswell', 'Johns Creek', 'Albany',
        'Warner Robins', 'Alpharetta', 'Marietta', 'Valdosta', 'Smyrna',
        'Dunwoody', 'Rome', 'East Point', 'Milton', 'Peachtree City',
        'Gainesville', 'Hinesville', 'Newnan', 'Kennesaw', 'Douglasville'
    ],
    'North Carolina': [
        'Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem',
        'Fayetteville', 'Cary', 'Wilmington', 'High Point', 'Concord',
        'Greenville', 'Asheville', 'Gastonia', 'Jacksonville', 'Chapel Hill',
        'Rocky Mount', 'Burlington', 'Wilson', 'Huntersville', 'Kannapolis',
        'Apex', 'Hickory', 'Goldsboro', 'Indian Trail', 'Monroe'
    ],
    'Arizona': [
        'Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale',
        'Glendale', 'Gilbert', 'Tempe', 'Peoria', 'Surprise',
        'Yuma', 'Avondale', 'Goodyear', 'Flagstaff', 'Buckeye',
        'Lake Havasu City', 'Casa Grande', 'Sierra Vista', 'Maricopa', 'Oro Valley',
        'Prescott', 'Bullhead City', 'Prescott Valley', 'Apache Junction', 'Marana'
    ],
    'Nevada': [
        'Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks',
        'Carson City', 'Fernley', 'Elko', 'Mesquite', 'Boulder City',
        'Fallon', 'Winnemucca', 'West Wendover', 'Ely', 'Yerington'
    ],
    'Colorado': [
        'Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood',
        'Thornton', 'Arvada', 'Westminster', 'Pueblo', 'Centennial',
        'Boulder', 'Greeley', 'Longmont', 'Loveland', 'Grand Junction',
        'Broomfield', 'Castle Rock', 'Commerce City', 'Parker', 'Littleton',
        'Northglenn', 'Brighton', 'Englewood', 'Wheat Ridge', 'Fountain'
    ],
    'Washington': [
        'Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue',
        'Kent', 'Everett', 'Renton', 'Spokane Valley', 'Federal Way',
        'Yakima', 'Bellingham', 'Kennewick', 'Auburn', 'Pasco',
        'Marysville', 'Lakewood', 'Redmond', 'Shoreline', 'Richland',
        'Kirkland', 'Burien', 'Sammamish', 'Olympia', 'Lacey',
        'Edmonds', 'Bremerton', 'Puyallup', 'Wenatchee', 'Mount Vernon'
    ]
};

// Helper function to get cities for a state
function getCitiesForState(state) {
    return US_CITIES_BY_STATE[state] || [];
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { US_CITIES_BY_STATE, getCitiesForState };
}
