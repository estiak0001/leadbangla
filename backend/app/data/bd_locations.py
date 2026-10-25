"""Bangladesh: 8 divisions, 64 districts (English, Bangla, division, approximate district-centre latitude/longitude). Seeded into each company's own Locations list."""
# name, Bangla, approximate centre latitude, longitude
DIVISION_ROWS: list[tuple[str, str, float, float]] = [
    ("Dhaka", "ঢাকা", 23.8103, 90.4125), ("Chattogram", "চট্টগ্রাম", 22.3569, 91.7832), ("Rajshahi", "রাজশাহী", 24.3745, 88.6042),
    ("Khulna", "খুলনা", 22.8456, 89.5403), ("Barishal", "বরিশাল", 22.7010, 90.3535), ("Sylhet", "সিলেট", 24.8949, 91.8687),
    ("Rangpur", "রংপুর", 25.7439, 89.2752), ("Mymensingh", "ময়মনসিংহ", 24.7471, 90.4203),
]
DIVISIONS = [d[0] for d in DIVISION_ROWS]

DISTRICTS: list[tuple[str, str, str, float, float]] = [
    # Dhaka (13)
    ("Dhaka", "ঢাকা", "Dhaka", 23.8103, 90.4125), ("Faridpur", "ফরিদপুর", "Dhaka", 23.607, 89.8429), ("Gazipur", "গাজীপুর", "Dhaka", 24.0023, 90.4264), ("Gopalganj", "গোপালগঞ্জ", "Dhaka", 23.005, 89.8266),
    ("Kishoreganj", "কিশোরগঞ্জ", "Dhaka", 24.4449, 90.7766), ("Madaripur", "মাদারীপুর", "Dhaka", 23.1641, 90.1896), ("Manikganj", "মানিকগঞ্জ", "Dhaka", 23.8617, 90.0003), ("Munshiganj", "মুন্সীগঞ্জ", "Dhaka", 23.5422, 90.5305),
    ("Narayanganj", "নারায়ণগঞ্জ", "Dhaka", 23.6238, 90.5), ("Narsingdi", "নরসিংদী", "Dhaka", 23.9193, 90.7176), ("Rajbari", "রাজবাড়ী", "Dhaka", 23.7574, 89.6445), ("Shariatpur", "শরীয়তপুর", "Dhaka", 23.2423, 90.4348),
    ("Tangail", "টাঙ্গাইল", "Dhaka", 24.2513, 89.9167),
    # Chattogram (11)
    ("Bandarban", "বান্দরবান", "Chattogram", 22.1953, 92.2184), ("Brahmanbaria", "ব্রাহ্মণবাড়িয়া", "Chattogram", 23.9571, 91.1119), ("Chandpur", "চাঁদপুর", "Chattogram", 23.2332, 90.6713),
    ("Chattogram", "চট্টগ্রাম", "Chattogram", 22.3569, 91.7832), ("Cumilla", "কুমিল্লা", "Chattogram", 23.4607, 91.1809), ("Cox's Bazar", "কক্সবাজার", "Chattogram", 21.4272, 92.0058), ("Feni", "ফেনী", "Chattogram", 23.0159, 91.3976),
    ("Khagrachhari", "খাগড়াছড়ি", "Chattogram", 23.1193, 91.9847), ("Lakshmipur", "লক্ষ্মীপুর", "Chattogram", 22.9425, 90.8412), ("Noakhali", "নোয়াখালী", "Chattogram", 22.8696, 91.0995), ("Rangamati", "রাঙ্গামাটি", "Chattogram", 22.7324, 92.2985),
    # Rajshahi (8)
    ("Bogura", "বগুড়া", "Rajshahi", 24.8465, 89.3773), ("Joypurhat", "জয়পুরহাট", "Rajshahi", 25.1, 89.0167), ("Naogaon", "নওগাঁ", "Rajshahi", 24.7936, 88.9318), ("Natore", "নাটোর", "Rajshahi", 24.4206, 89.0),
    ("Chapainawabganj", "চাঁপাইনবাবগঞ্জ", "Rajshahi", 24.5965, 88.2775), ("Pabna", "পাবনা", "Rajshahi", 24.0064, 89.2372), ("Rajshahi", "রাজশাহী", "Rajshahi", 24.3745, 88.6042), ("Sirajganj", "সিরাজগঞ্জ", "Rajshahi", 24.4534, 89.7007),
    # Khulna (10)
    ("Bagerhat", "বাগেরহাট", "Khulna", 22.6602, 89.7895), ("Chuadanga", "চুয়াডাঙ্গা", "Khulna", 23.6402, 88.8518), ("Jashore", "যশোর", "Khulna", 23.1667, 89.2081), ("Jhenaidah", "ঝিনাইদহ", "Khulna", 23.5448, 89.1539),
    ("Khulna", "খুলনা", "Khulna", 22.8456, 89.5403), ("Kushtia", "কুষ্টিয়া", "Khulna", 23.9013, 89.1205), ("Magura", "মাগুরা", "Khulna", 23.4855, 89.4199), ("Meherpur", "মেহেরপুর", "Khulna", 23.7622, 88.6318),
    ("Narail", "নড়াইল", "Khulna", 23.1725, 89.5127), ("Satkhira", "সাতক্ষীরা", "Khulna", 22.7185, 89.0705),
    # Barishal (6)
    ("Barguna", "বরগুনা", "Barishal", 22.1591, 90.1259), ("Barishal", "বরিশাল", "Barishal", 22.701, 90.3535), ("Bhola", "ভোলা", "Barishal", 22.6859, 90.6482), ("Jhalokati", "ঝালকাঠি", "Barishal", 22.6406, 90.1987),
    ("Patuakhali", "পটুয়াখালী", "Barishal", 22.3596, 90.3299), ("Pirojpur", "পিরোজপুর", "Barishal", 22.5841, 89.972),
    # Sylhet (4)
    ("Habiganj", "হবিগঞ্জ", "Sylhet", 24.3745, 91.4156), ("Moulvibazar", "মৌলভীবাজার", "Sylhet", 24.4829, 91.7774), ("Sunamganj", "সুনামগঞ্জ", "Sylhet", 25.0658, 91.395), ("Sylhet", "সিলেট", "Sylhet", 24.8949, 91.8687),
    # Rangpur (8)
    ("Dinajpur", "দিনাজপুর", "Rangpur", 25.6279, 88.6332), ("Gaibandha", "গাইবান্ধা", "Rangpur", 25.3297, 89.543), ("Kurigram", "কুড়িগ্রাম", "Rangpur", 25.8054, 89.6361), ("Lalmonirhat", "লালমনিরহাট", "Rangpur", 25.9923, 89.2847),
    ("Nilphamari", "নীলফামারী", "Rangpur", 25.9317, 88.856), ("Panchagarh", "পঞ্চগড়", "Rangpur", 26.3411, 88.5542), ("Rangpur", "রংপুর", "Rangpur", 25.7439, 89.2752), ("Thakurgaon", "ঠাকুরগাঁও", "Rangpur", 26.0337, 88.4616),
    # Mymensingh (4)
    ("Jamalpur", "জামালপুর", "Mymensingh", 24.9375, 89.9378), ("Mymensingh", "ময়মনসিংহ", "Mymensingh", 24.7471, 90.4203), ("Netrokona", "নেত্রকোণা", "Mymensingh", 24.87, 90.7279), ("Sherpur", "শেরপুর", "Mymensingh", 25.0204, 90.0152),
]
assert len(DISTRICTS) == 64


# Major areas (thanas / localities) of the big cities, as a starting point: (district, area, Bangla, lat, lng).
# Every one of Bangladesh's ~490 upazilas is not included — companies add the rest in Settings → Locations
# (one by one, or by uploading a CSV).
AREAS: list[tuple[str, str, str, float, float]] = [
    ("Dhaka", "Dhanmondi", "ধানমন্ডি", 23.7461, 90.3742), ("Dhaka", "Gulshan", "গুলশান", 23.7925, 90.4078), ("Dhaka", "Banani", "বনানী", 23.7937, 90.4066),
    ("Dhaka", "Uttara", "উত্তরা", 23.8759, 90.3795), ("Dhaka", "Mirpur", "মিরপুর", 23.8223, 90.3654), ("Dhaka", "Mohammadpur", "মোহাম্মদপুর", 23.7662, 90.3589),
    ("Dhaka", "Motijheel", "মতিঝিল", 23.7330, 90.4172), ("Dhaka", "Tejgaon", "তেজগাঁও", 23.7600, 90.3920), ("Dhaka", "Badda", "বাড্ডা", 23.7806, 90.4262),
    ("Dhaka", "Rampura", "রামপুরা", 23.7615, 90.4249), ("Dhaka", "Khilgaon", "খিলগাঁও", 23.7510, 90.4290), ("Dhaka", "Shahbagh", "শাহবাগ", 23.7380, 90.3953),
    ("Dhaka", "Ramna", "রমনা", 23.7390, 90.4007), ("Dhaka", "Lalbagh", "লালবাগ", 23.7190, 90.3880), ("Dhaka", "Sutrapur", "সূত্রাপুর", 23.7090, 90.4150),
    ("Dhaka", "Kotwali", "কোতোয়ালী", 23.7100, 90.4080), ("Dhaka", "Demra", "ডেমরা", 23.7230, 90.4950), ("Dhaka", "Jatrabari", "যাত্রাবাড়ী", 23.7100, 90.4350),
    ("Dhaka", "Pallabi", "পল্লবী", 23.8280, 90.3640), ("Dhaka", "Kafrul", "কাফরুল", 23.7900, 90.3790), ("Dhaka", "Cantonment", "ক্যান্টনমেন্ট", 23.8000, 90.4000),
    ("Dhaka", "Bashundhara", "বসুন্ধরা", 23.8190, 90.4260), ("Dhaka", "Farmgate", "ফার্মগেট", 23.7570, 90.3890), ("Dhaka", "Malibagh", "মালিবাগ", 23.7490, 90.4130),
    ("Dhaka", "Mohakhali", "মহাখালী", 23.7780, 90.4000), ("Dhaka", "Banasree", "বনশ্রী", 23.7630, 90.4330), ("Dhaka", "Savar", "সাভার", 23.8583, 90.2667),
    ("Dhaka", "Keraniganj", "কেরানীগঞ্জ", 23.6970, 90.3600), ("Dhaka", "Dakshinkhan", "দক্ষিণখান", 23.8500, 90.4300), ("Dhaka", "Khilkhet", "খিলক্ষেত", 23.8290, 90.4200),
    ("Dhaka", "Hazaribagh", "হাজারীবাগ", 23.7350, 90.3680), ("Dhaka", "Gendaria", "গেণ্ডারিয়া", 23.7000, 90.4250),
    ("Chattogram", "Agrabad", "আগ্রাবাদ", 22.3250, 91.8100), ("Chattogram", "Pahartali", "পাহাড়তলী", 22.3600, 91.8000), ("Chattogram", "Panchlaish", "পাঁচলাইশ", 22.3640, 91.8190),
    ("Chattogram", "Khulshi", "খুলশী", 22.3600, 91.8000), ("Chattogram", "Kotwali", "কোতোয়ালী", 22.3380, 91.8350), ("Chattogram", "Halishahar", "হালিশহর", 22.3300, 91.7700),
    ("Chattogram", "Bandar", "বন্দর", 22.2900, 91.8100), ("Chattogram", "Double Mooring", "ডবলমুরিং", 22.3200, 91.8100), ("Chattogram", "Chandgaon", "চান্দগাঁও", 22.3800, 91.8500),
    ("Chattogram", "Bayazid", "বায়েজিদ", 22.3800, 91.8200), ("Chattogram", "Patenga", "পতেঙ্গা", 22.2300, 91.8000), ("Chattogram", "Sitakunda", "সীতাকুণ্ড", 22.6200, 91.6600),
    ("Chattogram", "Hathazari", "হাটহাজারী", 22.5000, 91.8100), ("Chattogram", "Raozan", "রাউজান", 22.5300, 91.9100),
    ("Sylhet", "Zindabazar", "জিন্দাবাজার", 24.8970, 91.8710), ("Sylhet", "Ambarkhana", "আম্বরখানা", 24.9050, 91.8700), ("Sylhet", "Subidbazar", "সুবিদবাজার", 24.8960, 91.8820),
    ("Sylhet", "Upashahar", "উপশহর", 24.9150, 91.8800), ("Sylhet", "Bandarbazar", "বন্দরবাজার", 24.8990, 91.8600),
    ("Khulna", "Sonadanga", "সোনাডাঙ্গা", 22.8030, 89.5380), ("Khulna", "Khalishpur", "খালিশপুর", 22.8500, 89.5600), ("Khulna", "Daulatpur", "দৌলতপুর", 22.8800, 89.5200),
    ("Khulna", "Boyra", "বয়রা", 22.8300, 89.5400),
    ("Rajshahi", "Boalia", "বোয়ালিয়া", 24.3700, 88.6000), ("Rajshahi", "Motihar", "মতিহার", 24.3700, 88.6400), ("Rajshahi", "Rajpara", "রাজপাড়া", 24.3800, 88.5900),
]
