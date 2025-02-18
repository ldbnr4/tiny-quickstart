interface BudgetCategory {
    name: string;
    subcategories: string[];
}

const budgetCategories: BudgetCategory[] = [
    {
        name: "Banking Fees",
        subcategories: [
            "Bank Fees",
            "Overdraft",
            "ATM Fees",
            "Late Payment Fees",
            "Fraud Dispute Fees",
            "Foreign Transaction Fees",
            "Wire Transfer Fees",
            "Insufficient Funds Fees",
            "Cash Advance Fees",
            "Excess Activity Fees",
        ],
    },
    {
        name: "Community & Social Services",
        subcategories: [
            "Animal Shelter",
            "Assisted Living Services",
            "Facilities and Nursing Homes",
            "Caretakers",
            "Cemetery",
            "Courts",
            "Day Care and Preschools",
            "Disabled Persons Services",
            "Drug and Alcohol Services",
            "Housing Assistance and Shelters",
            "Libraries",
            "Senior Citizen Services",
            "Retirement Services",
        ],
    },
    {
        name: "Education",
        subcategories: [
            "Vocational Schools",
            "Tutoring and Educational Services",
            "Primary and Secondary Schools",
            "Fraternities and Sororities",
            "Driving Schools",
            "Dance Schools",
            "Culinary Lessons and Schools",
            "Computer Training",
            "Colleges and Universities",
            "Art School",
            "Adult Education",
        ],
    },
    {
        name: "Government & Public Services",
        subcategories: [
            "Government Departments and Agencies",
            "Government Lobbyists",
            "Law Enforcement (Police Stations, Fire Stations, Correctional Institutions)",
            "Military",
            "Post Offices",
            "Public and Social Services",
        ],
    },
    {
        name: "Religious & Charitable Donations",
        subcategories: [
            "Religious Organizations (Temples, Synagogues, Mosques, Churches)",
            "Charities and Non-Profits",
            "Youth Organizations",
            "Environmental Organizations",
        ],
    },
    {
        name: "Food & Dining",
        subcategories: [
            "Bars (Wine Bar, Sports Bar, Hotel Lounge, Breweries)",
            "Restaurants (all cuisines listed)",
            "Fast Food",
            "Coffee Shops",
            "Juice Bars",
            "Food Trucks",
            "Cafes",
            "Ice Cream",
            "Donuts",
            "Bakeries",
        ],
    },
    {
        name: "Healthcare",
        subcategories: [
            "Healthcare Services (Hospitals, Clinics, Medical Centers)",
            "Physicians (all specialties listed)",
            "Dentists",
            "Mental Health Services",
            "Chiropractors",
            "Alternative Medicine (Acupuncture, Nutritionists)",
            "Medical Supplies and Labs",
            "Emergency Services",
            "Blood Banks and Centers",
        ],
    },
    {
        name: "Interest & Payments",
        subcategories: [
            "Interest Earned",
            "Interest Charged",
            "Credit Card Payments",
            "Loan Payments",
            "Rent Payments",
        ],
    },
    {
        name: "Recreation & Entertainment",
        subcategories: [
            "Arts and Entertainment (Theaters, Museums, Galleries)",
            "Sports Venues",
            "Social Clubs",
            "Casinos and Gaming",
            "Movie Theaters",
            "Arcades and Amusement Parks",
            "Parks and Recreation (Beaches, Mountains, Lakes)",
            "Gyms and Fitness Centers",
            "Sports and Recreation Camps",
            "Zoos and Aquariums",
        ],
    },
    {
        name: "Services",
        subcategories: [
            "Advertising and Marketing",
            "Business Services (Consulting, Printing, Legal, Accounting)",
            "Cleaning Services",
            "Home Improvement (Plumbing, Landscaping, HVAC)",
            "Personal Care (Hair Salons, Spas, Tattooing)",
            "Repair Services (Automotive, Electronics, Appliances)",
            "Security and Safety Services",
            "Telecommunications",
            "Utilities (Electric, Gas, Water)",
        ],
    },
    {
        name: "Shopping & Retail",
        subcategories: [
            "Clothing and Accessories",
            "Electronics and Computers",
            "Furniture and Home Decor",
            "Groceries and Supermarkets",
            "Health Food Stores",
            "Pet Stores",
            "Sporting Goods",
            "Toys and Hobbies",
            "Vintage and Thrift Stores",
        ],
    },
    {
        name: "Travel & Transportation",
        subcategories: [
            "Airlines and Aviation Services",
            "Car Rentals and Ride Shares",
            "Gas Stations",
            "Lodging (Hotels, Resorts, Vacation Rentals)",
            "Public Transportation",
            "Taxis and Limos",
            "Tolls and Parking",
        ],
    },
    {
        name: "Taxes & Transfers",
        subcategories: [
            "Tax Payments",
            "Tax Refunds",
            "Transfers (Internal, ACH, Wire)",
            "Third-Party Payments (PayPal, Venmo, etc.)",
        ],
    },
    {
        name: "Investments & Savings",
        subcategories: [
            "Savings Accounts",
            "Investments (Stocks, Funds)",
            "Retirement Contributions",
        ],
    },
    {
        name: "Insurance",
        subcategories: [
            "Health Insurance",
            "Car Insurance",
            "Home Insurance",
            "Life Insurance",
        ],
    },
];

export default budgetCategories;