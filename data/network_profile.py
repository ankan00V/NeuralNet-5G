from __future__ import annotations

FEATURE_NAMES = [
    "rsrp",
    "sinr",
    "dl_throughput",
    "ul_throughput",
    "ho_failure_rate",
    "rtt",
]

# These are reporting and simulation clamps, not healthy operating targets.
KPI_LIMITS = {
    "rsrp": {"min": -140.0, "max": -44.0},
    "sinr": {"min": -23.0, "max": 40.0},
    "dl_throughput": {"min": 0.0, "max": 1200.0},
    "ul_throughput": {"min": 0.0, "max": 200.0},
    "ho_failure_rate": {"min": 0.0, "max": 100.0},
    "rtt": {"min": 5.0, "max": 500.0},
}

# Operating profiles are engineering baselines inferred from 5G KPI definitions,
# current India 5G throughput/latency observations, and common RAN tuning practice.
PROFILE_BASELINES = {
    "urban_core": {
        "rsrp": {"mean": -84.0, "std": 5.0},
        "sinr": {"mean": 18.0, "std": 4.5},
        "dl_throughput": {"mean": 330.0, "std": 70.0},
        "ul_throughput": {"mean": 43.0, "std": 11.0},
        "ho_failure_rate": {"mean": 0.8, "std": 0.35},
        "rtt": {"mean": 11.0, "std": 3.0},
    },
    "dense_urban": {
        "rsrp": {"mean": -88.0, "std": 6.0},
        "sinr": {"mean": 13.5, "std": 4.5},
        "dl_throughput": {"mean": 255.0, "std": 65.0},
        "ul_throughput": {"mean": 36.0, "std": 10.0},
        "ho_failure_rate": {"mean": 1.2, "std": 0.45},
        "rtt": {"mean": 15.0, "std": 4.0},
    },
    "enterprise": {
        "rsrp": {"mean": -82.0, "std": 4.5},
        "sinr": {"mean": 20.0, "std": 3.5},
        "dl_throughput": {"mean": 305.0, "std": 55.0},
        "ul_throughput": {"mean": 46.0, "std": 9.0},
        "ho_failure_rate": {"mean": 0.7, "std": 0.25},
        "rtt": {"mean": 10.0, "std": 2.5},
    },
    "transit_hub": {
        "rsrp": {"mean": -91.0, "std": 7.0},
        "sinr": {"mean": 10.5, "std": 5.0},
        "dl_throughput": {"mean": 205.0, "std": 75.0},
        "ul_throughput": {"mean": 28.0, "std": 9.0},
        "ho_failure_rate": {"mean": 1.8, "std": 0.65},
        "rtt": {"mean": 18.0, "std": 5.5},
    },
    "suburban": {
        "rsrp": {"mean": -96.0, "std": 7.0},
        "sinr": {"mean": 8.0, "std": 4.5},
        "dl_throughput": {"mean": 180.0, "std": 55.0},
        "ul_throughput": {"mean": 24.0, "std": 8.0},
        "ho_failure_rate": {"mean": 1.5, "std": 0.55},
        "rtt": {"mean": 20.0, "std": 5.0},
    },
}

SITE_PROFILES = [
    {"tower_id": "TOWER_001", "city": "Delhi - Connaught Place", "lat": 28.6315, "lon": 77.2167, "profile": "urban_core", "operator": "Airtel"},
    {"tower_id": "TOWER_002", "city": "Delhi - Aerocity", "lat": 28.5484, "lon": 77.1218, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_003", "city": "Delhi - Dwarka Sec 21", "lat": 28.5562, "lon": 77.0562, "profile": "transit_hub", "operator": "Vi"},
    {"tower_id": "TOWER_004", "city": "Noida - Sector 62", "lat": 28.6280, "lon": 77.3649, "profile": "enterprise", "operator": "Airtel"},
    {"tower_id": "TOWER_005", "city": "Gurugram - Cyber City", "lat": 28.4955, "lon": 77.0890, "profile": "urban_core", "operator": "Jio"},
    {"tower_id": "TOWER_006", "city": "Mumbai - BKC", "lat": 19.0607, "lon": 72.8681, "profile": "enterprise", "operator": "Airtel"},
    {"tower_id": "TOWER_007", "city": "Mumbai - Lower Parel", "lat": 19.0023, "lon": 72.8300, "profile": "urban_core", "operator": "Jio"},
    {"tower_id": "TOWER_008", "city": "Mumbai - Andheri East", "lat": 19.1136, "lon": 72.8697, "profile": "dense_urban", "operator": "Vi"},
    {"tower_id": "TOWER_009", "city": "Navi Mumbai - Vashi", "lat": 19.0771, "lon": 72.9986, "profile": "transit_hub", "operator": "Jio"},
    {"tower_id": "TOWER_010", "city": "Mumbai - Colaba", "lat": 18.9067, "lon": 72.8147, "profile": "dense_urban", "operator": "BSNL"},
    {"tower_id": "TOWER_011", "city": "Bengaluru - MG Road", "lat": 12.9755, "lon": 77.6065, "profile": "urban_core", "operator": "Airtel"},
    {"tower_id": "TOWER_012", "city": "Bengaluru - Whitefield", "lat": 12.9698, "lon": 77.7499, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_013", "city": "Bengaluru - Outer Ring Road", "lat": 12.9346, "lon": 77.6818, "profile": "dense_urban", "operator": "Airtel"},
    {"tower_id": "TOWER_014", "city": "Bengaluru - Electronic City", "lat": 12.8399, "lon": 77.6770, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_015", "city": "Bengaluru - Yelahanka", "lat": 13.1005, "lon": 77.5963, "profile": "suburban", "operator": "BSNL"},
    {"tower_id": "TOWER_016", "city": "Hyderabad - HITEC City", "lat": 17.4435, "lon": 78.3772, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_017", "city": "Hyderabad - Gachibowli", "lat": 17.4401, "lon": 78.3489, "profile": "enterprise", "operator": "Airtel"},
    {"tower_id": "TOWER_018", "city": "Hyderabad - Secunderabad", "lat": 17.4399, "lon": 78.4983, "profile": "transit_hub", "operator": "Vi"},
    {"tower_id": "TOWER_019", "city": "Hyderabad - Begumpet", "lat": 17.4447, "lon": 78.4664, "profile": "dense_urban", "operator": "Airtel"},
    {"tower_id": "TOWER_020", "city": "Hyderabad - Shamshabad", "lat": 17.2403, "lon": 78.4294, "profile": "suburban", "operator": "BSNL"},
    {"tower_id": "TOWER_021", "city": "Chennai - OMR", "lat": 12.9170, "lon": 80.2290, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_022", "city": "Chennai - T Nagar", "lat": 13.0418, "lon": 80.2337, "profile": "urban_core", "operator": "Airtel"},
    {"tower_id": "TOWER_023", "city": "Chennai - Guindy", "lat": 13.0104, "lon": 80.2205, "profile": "transit_hub", "operator": "Vi"},
    {"tower_id": "TOWER_024", "city": "Chennai - Ambattur", "lat": 13.1143, "lon": 80.1548, "profile": "dense_urban", "operator": "BSNL"},
    {"tower_id": "TOWER_025", "city": "Chennai - Anna Nagar", "lat": 13.0850, "lon": 80.2101, "profile": "dense_urban", "operator": "Airtel"},
    {"tower_id": "TOWER_026", "city": "Kolkata - Salt Lake Sector V", "lat": 22.5766, "lon": 88.4323, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_027", "city": "Kolkata - Park Street", "lat": 22.5536, "lon": 88.3525, "profile": "urban_core", "operator": "Airtel"},
    {"tower_id": "TOWER_028", "city": "Kolkata - New Town", "lat": 22.5827, "lon": 88.4734, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_029", "city": "Kolkata - Howrah Junction", "lat": 22.5851, "lon": 88.3426, "profile": "transit_hub", "operator": "Vi"},
    {"tower_id": "TOWER_030", "city": "Kolkata - Rajarhat", "lat": 22.6251, "lon": 88.4441, "profile": "suburban", "operator": "BSNL"},
    {"tower_id": "TOWER_031", "city": "Pune - Hinjawadi", "lat": 18.5912, "lon": 73.7389, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_032", "city": "Pune - Baner", "lat": 18.5590, "lon": 73.7868, "profile": "dense_urban", "operator": "Airtel"},
    {"tower_id": "TOWER_033", "city": "Pune - Kharadi", "lat": 18.5519, "lon": 73.9440, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_034", "city": "Pune - Shivajinagar", "lat": 18.5308, "lon": 73.8475, "profile": "urban_core", "operator": "Vi"},
    {"tower_id": "TOWER_035", "city": "Pune - Pimpri", "lat": 18.6298, "lon": 73.7997, "profile": "suburban", "operator": "BSNL"},
    {"tower_id": "TOWER_036", "city": "Ahmedabad - SG Highway", "lat": 23.0422, "lon": 72.5030, "profile": "enterprise", "operator": "Airtel"},
    {"tower_id": "TOWER_037", "city": "Ahmedabad - Prahlad Nagar", "lat": 23.0117, "lon": 72.5067, "profile": "dense_urban", "operator": "Jio"},
    {"tower_id": "TOWER_038", "city": "Gandhinagar - Infocity", "lat": 23.1644, "lon": 72.6369, "profile": "enterprise", "operator": "BSNL"},
    {"tower_id": "TOWER_039", "city": "Ahmedabad - Maninagar", "lat": 22.9960, "lon": 72.6028, "profile": "dense_urban", "operator": "Vi"},
    {"tower_id": "TOWER_040", "city": "Ahmedabad - Naroda", "lat": 23.0670, "lon": 72.6776, "profile": "suburban", "operator": "BSNL"},
    {"tower_id": "TOWER_041", "city": "Jaipur - Malviya Nagar", "lat": 26.8520, "lon": 75.8122, "profile": "dense_urban", "operator": "Airtel"},
    {"tower_id": "TOWER_042", "city": "Jaipur - Vaishali Nagar", "lat": 26.9111, "lon": 75.7445, "profile": "suburban", "operator": "BSNL"},
    {"tower_id": "TOWER_043", "city": "Jaipur - Civil Lines", "lat": 26.8996, "lon": 75.7892, "profile": "urban_core", "operator": "Jio"},
    {"tower_id": "TOWER_044", "city": "Jaipur - Mansarovar", "lat": 26.8472, "lon": 75.7685, "profile": "dense_urban", "operator": "Vi"},
    {"tower_id": "TOWER_045", "city": "Jaipur - Kukas", "lat": 27.0324, "lon": 75.8856, "profile": "suburban", "operator": "BSNL"},
    {"tower_id": "TOWER_046", "city": "Lucknow - Gomti Nagar", "lat": 26.8486, "lon": 81.0080, "profile": "enterprise", "operator": "Jio"},
    {"tower_id": "TOWER_047", "city": "Lucknow - Hazratganj", "lat": 26.8500, "lon": 80.9462, "profile": "urban_core", "operator": "Airtel"},
    {"tower_id": "TOWER_048", "city": "Lucknow - Charbagh", "lat": 26.8310, "lon": 80.9222, "profile": "transit_hub", "operator": "Vi"},
    {"tower_id": "TOWER_049", "city": "Lucknow - Aliganj", "lat": 26.8798, "lon": 80.9482, "profile": "dense_urban", "operator": "BSNL"},
    {"tower_id": "TOWER_050", "city": "Lucknow - Amausi", "lat": 26.7615, "lon": 80.8856, "profile": "suburban", "operator": "BSNL"},
]

SHOWCASE_TOWERS = [
    "TOWER_006",
    "TOWER_013",
    "TOWER_024",
    "TOWER_031",
    "TOWER_042",
]

SHOWCASE_NOTES = {
    "TOWER_006": "Mumbai - BKC enterprise hotspot for congestion demos.",
    "TOWER_013": "Bengaluru ORR dense traffic corridor for mobility pressure.",
    "TOWER_024": "Chennai Ambattur mixed industrial coverage edge case.",
    "TOWER_031": "Pune Hinjawadi enterprise cluster for low-latency stability.",
    "TOWER_042": "Jaipur Vaishali Nagar suburban coverage-degradation demo site.",
}

KPI_DANGER_THRESHOLDS = {
    "rsrp": -110.0,
    "sinr": 0.0,
    "dl_throughput": 80.0,
    "ul_throughput": 12.0,
    "ho_failure_rate": 5.0,
    "rtt": 100.0,
}
