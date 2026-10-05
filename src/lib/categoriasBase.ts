// © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
/**
 * Tipo de negócio da XS → [categorias da base aberta (taxonomia da Overture Maps), pedaços do nome].
 * Os códigos foram conferidos numa amostra de São Paulo e Londrina. Os pedaços do nome pegam
 * quem está numa categoria genérica (ex.: "Açaí da Praça" como "restaurant").
 */
export const BASE: Record<string, [string[], string[]?]> = {
  Barbearia: [['barber'], ['barbearia', 'barber']],
  'Salão de beleza': [['beauty_salon', 'hair_salon', 'personal_or_beauty_service', 'hair_extensions']],
  'Clínica de estética': [['skin_care_and_makeup', 'medical_spa', 'beauty_salon', 'laser_hair_removal', 'tanning_salon'], ['estetica']],
  'Manicure e esmalteria': [['nail_salon'], ['esmalteria', 'manicure', 'nail']],
  'Sobrancelhas e cílios': [
    ['eyelash_service', 'eyebrow_service', 'threading_service'],
    ['sobrancelha', 'cilios', 'lash', 'brow'],
  ],
  'Estúdio de tatuagem': [
    ['tattoo_and_piercing', 'tattoo', 'piercing'],
    ['tattoo', 'tatuagem'],
  ],
  Depilação: [['waxing', 'hair_removal', 'laser_hair_removal'], ['depila']],
  'Loja de cosméticos': [['cosmetics_and_fragrance_store', 'beauty_supply_store', 'beauty_product_supplier', 'perfume_store']],

  Dentista: [
    [
      'dental_clinic',
      'general_dentistry',
      'cosmetic_dentistry',
      'orthodontics',
      'pediatric_dentistry',
      'periodontics',
      'prosthodontics',
      'endodontics',
      'oral_and_maxillofacial_surgery',
      'dentist',
    ],
  ],
  'Clínica médica': [
    [
      'doctors_office',
      'health_care',
      'outpatient_care_facility',
      'family_practice',
      'medical_center',
      'dermatology',
      'pediatric_clinic',
      'obstetrics_and_gynecology',
      'cardiology',
      'orthopedics',
    ],
  ],
  Fisioterapia: [
    ['physical_therapy', 'occupational_therapy', 'chiropractic', 'osteopathic_medicine'],
    ['fisioterapia', 'fisio'],
  ],
  Psicólogo: [['psychology', 'psychotherapy', 'counseling', 'behavioral_or_mental_health_clinic'], ['psicolog']],
  Nutricionista: [['nutrition_service', 'dietitian', 'weight_loss_center'], ['nutri']],
  Fonoaudiologia: [['speech_therapy', 'audiology'], ['fono']],
  'Laboratório de exames': [['laboratory_testing', 'diagnostic_imaging', 'laboratory', 'medical_laboratory']],
  Farmácia: [['pharmacy', 'drugstore', 'compounding_pharmacy']],
  Ótica: [['eyewear_store', 'optometry', 'vision_or_eye_care_clinic', 'optician']],
  'Clínica veterinária': [['veterinarian', 'emergency_pet_hospital', 'animal_hospital'], ['veterinari']],

  Restaurante: [
    [
      'restaurant',
      'brazilian_restaurant',
      'italian_restaurant',
      'buffet_restaurant',
      'seafood_restaurant',
      'bar_and_grill_restaurant',
      'arabian_restaurant',
      'vegetarian_restaurant',
      'portuguese_restaurant',
      'french_restaurant',
      'mexican_restaurant',
      'chinese_restaurant',
      'asian_restaurant',
      'latin_american_restaurant',
      'mediterranean_restaurant',
      'middle_eastern_restaurant',
      'american_restaurant',
      'peruvian_restaurant',
      'argentine_restaurant',
      'thai_restaurant',
      'korean_restaurant',
      'spanish_restaurant',
      'european_restaurant',
      'health_food_restaurant',
      'chicken_restaurant',
    ],
  ],
  Pizzaria: [['pizza_restaurant'], ['pizza']],
  Hamburgueria: [['burger_restaurant'], ['burger', 'hamburguer']],
  Lanchonete: [
    ['fast_food_restaurant', 'sandwich_shop', 'diner', 'hot_dog_restaurant', 'food_truck_stand', 'casual_eatery'],
    ['lanchonete', 'lanches'],
  ],
  Padaria: [['bakery'], ['padaria', 'panificadora']],
  'Confeitaria e doceria': [
    ['dessert_shop', 'candy_store', 'chocolatier', 'cupcake_shop', 'patisserie_cake_shop', 'cake_shop', 'donut_shop'],
    ['confeitaria', 'doceria', 'doces', 'bolos'],
  ],
  Cafeteria: [['cafe', 'coffee_shop', 'tea_room', 'breakfast_and_brunch_restaurant']],
  'Sorveteria e açaí': [
    ['ice_cream_shop', 'gelato_shop', 'smoothie_juice_bar', 'frozen_yoghurt_shop'],
    ['acai', 'sorvete'],
  ],
  Bar: [['bar', 'pub', 'beer_bar', 'cocktail_bar', 'wine_bar', 'sports_bar', 'lounge', 'gastropub', 'beer_garden', 'brewery']],
  'Restaurante japonês': [
    ['japanese_restaurant', 'sushi_restaurant', 'poke_restaurant'],
    ['sushi', 'temaki'],
  ],
  Churrascaria: [['steakhouse', 'barbecue_restaurant'], ['churrasc']],
  Marmitaria: [['food_delivery_service'], ['marmit', 'quentinha']],
  Açougue: [
    ['butcher_shop', 'meat_shop'],
    ['acougue', 'casa de carnes'],
  ],
  Hortifruti: [
    ['produce_store', 'farmers_market', 'organic_grocery_store'],
    ['hortifruti', 'sacolao'],
  ],
  Mercado: [['grocery_store', 'convenience_store', 'supermarket', 'food_and_beverage_store', 'warehouse_club_store']],
  'Distribuidora de bebidas': [
    ['liquor_store', 'beer_wine_spirits_store', 'food_beverage_distributor', 'beverage_store'],
    ['adega', 'distribuidora de bebidas'],
  ],

  'Oficina mecânica': [
    ['automotive_repair', 'automotive_service', 'oil_change_station', 'transmission_repair', 'truck_repair'],
    ['mecanica', 'auto center'],
  ],
  'Auto peças': [
    ['auto_parts_store', 'vehicle_parts_store'],
    ['auto pecas', 'autopecas'],
  ],
  'Lava-rápido': [
    ['car_wash', 'auto_detailing'],
    ['lava rapido', 'lava jato', 'estetica automotiva'],
  ],
  'Funilaria e pintura': [
    ['auto_body_shop', 'auto_restoration_service'],
    ['funilaria', 'lanternagem'],
  ],
  Borracharia: [
    ['tire_dealer_and_repair', 'tire_shop'],
    ['borracharia', 'pneu'],
  ],
  'Loja de carros': [
    ['auto_dealer', 'used_auto_dealer', 'car_dealer'],
    ['veiculos', 'seminovos'],
  ],
  Motos: [
    ['motorcycle_dealer', 'motorcycle_repair', 'motorcycle_parts_store'],
    ['motos', 'moto pecas'],
  ],
  Autoescola: [['driving_school'], ['autoescola', 'auto escola', 'cfc']],
  'Som e acessórios automotivos': [
    ['car_stereo_store', 'car_window_tinting', 'auto_customization'],
    ['som automotivo', 'insulfilm'],
  ],

  'Pet shop': [
    ['pet_store', 'animal_or_pet_service', 'aquatic_pet_store'],
    ['pet shop', 'petshop'],
  ],
  'Banho e tosa': [['pet_groomer'], ['banho e tosa', 'tosa']],
  'Hotel e creche para cães': [
    ['pet_boarding', 'pet_sitting', 'dog_trainer'],
    ['hotel pet', 'creche canina', 'hotel para caes'],
  ],

  'Material de construção': [
    ['building_supply_store', 'hardware_store', 'home_improvement_store', 'lumber_store', 'hardware_home_and_garden_store'],
    ['material de construcao', 'materiais de construcao'],
  ],
  Marcenaria: [
    ['carpenter', 'cabinetry', 'furniture_assembly', 'woodworking'],
    ['marcenaria', 'moveis planejados'],
  ],
  Vidraçaria: [
    ['glass_and_mirror_sales_service', 'windows_installation'],
    ['vidracaria', 'vidros'],
  ],
  Serralheria: [['metal_fabricator', 'iron_work'], ['serralheria']],
  'Loja de móveis': [['furniture_store', 'office_furniture_store']],
  Colchões: [['mattress_store'], ['colchoes', 'colchao']],
  Eletricista: [['electrician'], ['eletricista', 'eletrica']],
  Encanador: [['plumbing'], ['desentup', 'encanador', 'hidraulica']],
  'Ar-condicionado': [
    ['hvac_service', 'commercial_refrigeration'],
    ['ar condicionado', 'refrigeracao', 'climatizacao'],
  ],
  Dedetizadora: [['pest_control_service'], ['dedetiz', 'controle de pragas']],
  'Jardinagem e paisagismo': [
    ['landscaping', 'nursery_and_gardening_store', 'gardener'],
    ['paisagismo', 'jardinagem'],
  ],
  Chaveiro: [['key_and_locksmith', 'locksmith'], ['chaveiro']],
  Decoração: [['home_goods_store', 'interior_design', 'lighting_store', 'linen_store', 'home_decor', 'carpet_store'], ['decoracao']],

  Advocacia: [
    ['attorney_or_law_firm', 'legal_service', 'employment_law', 'criminal_defense_law', 'divorce_and_family_law', 'tax_law', 'real_estate_law', 'immigration_law', 'medical_law'],
    ['advocacia', 'advogad'],
  ],
  Contabilidade: [['accountant', 'tax_services', 'bookkeeper'], ['contabil']],
  Imobiliária: [
    ['real_estate_service', 'real_estate_agent', 'property_management', 'commercial_real_estate', 'real_estate_investment'],
    ['imobiliaria', 'imoveis'],
  ],
  Arquitetura: [['architectural_designer', 'architect'], ['arquitetura']],
  Engenharia: [['engineering_service', 'civil_engineers', 'building_or_construction_service', 'contractor'], ['engenharia']],
  'Corretora de seguros': [['insurance_agency'], ['seguros', 'corretora']],
  'Agência de viagens': [
    ['travel_service', 'travel_agent', 'tour_operator', 'travel_company'],
    ['turismo', 'viagens'],
  ],
  Despachante: [['vehicle_registration_service'], ['despachante']],
  Gráfica: [['printing_service', 't_shirt_printing_service', 'sign_making'], ['grafica']],
  Fotografia: [
    ['event_photography_service', 'photographer', 'photography_studio'],
    ['fotografia', 'foto'],
  ],
  Lavanderia: [['laundromat', 'dry_cleaning', 'laundry_service'], ['lavanderia']],
  'Costura e ajustes': [
    ['sewing_and_alterations', 'tailor'],
    ['costura', 'ajustes'],
  ],
  'Assistência técnica': [['it_service_and_computer_repair', 'appliance_repair_service', 'mobile_phone_repair', 'electronics_repair_shop'], ['assistencia tecnica']],

  'Escola particular': [['private_school', 'elementary_school', 'high_school', 'school', 'religious_school']],
  'Escola infantil': [
    ['preschool', 'day_care_preschool', 'child_care_and_day_care'],
    ['escola infantil', 'bercario'],
  ],
  'Escola de idiomas': [['language_school'], ['ingles', 'idiomas', 'english']],
  'Escola de música': [['music_school'], ['escola de musica']],
  'Cursos e reforço': [
    ['tutoring_service', 'test_preparation', 'vocational_and_technical_school', 'specialty_school', 'educational_service'],
    ['reforco', 'preparatorio', 'cursinho'],
  ],

  Academia: [
    ['gym', 'fitness_trainer', 'sport_or_fitness_facility'],
    ['academia', 'fitness'],
  ],
  Pilates: [['pilates_studio'], ['pilates']],
  'Crossfit e funcional': [['crossfit'], ['crossfit', 'funcional']],
  'Artes marciais': [
    ['martial_arts_club', 'boxing_gym', 'karate_club', 'brazilian_jiu_jitsu_club'],
    ['jiu jitsu', 'muay thai', 'karate', 'judo'],
  ],
  Yoga: [['yoga_studio', 'meditation_center'], ['yoga']],
  'Massagem e spa': [['massage_therapy', 'spa', 'day_spa', 'health_spa', 'massage'], ['massagem']],

  'Loja de roupas': [
    [
      'clothing_store',
      'womens_clothing_store',
      'mens_clothing_store',
      'childrens_clothing_store',
      'fashion_boutique',
      'fashion_and_apparel_store',
      'lingerie_store',
      'swimwear_store',
      'sportswear_store',
      'second_hand_clothing_store',
      'bridal_shop',
      'maternity_wear',
    ],
  ],
  Calçados: [['shoe_store'], ['calcados']],
  'Joalheria e relojoaria': [
    ['jewelry_store', 'watch_store', 'fashion_accessories_store'],
    ['joias', 'relojoaria'],
  ],
  Papelaria: [['office_supply_store', 'educational_supply_store', 'stationery_store'], ['papelaria']],
  Floricultura: [
    ['flowers_and_gifts_store', 'florist'],
    ['floricultura', 'flores'],
  ],
  Celulares: [
    ['mobile_phone_store', 'mobile_phone_repair'],
    ['celular', 'celulares'],
  ],
  Informática: [['computer_store', 'electronics_store'], ['informatica']],
  Brinquedos: [['toy_store', 'hobby_shop'], ['brinquedos']],
  Presentes: [['gift_shop', 'souvenir_store', 'discount_store'], ['presentes']],
  Bicicletaria: [
    ['bike_store', 'bike_repair_maintenance'],
    ['bike', 'bicicleta'],
  ],
  'Artigos esportivos': [['sporting_goods_store', 'outdoor_gear'], ['esporte']],
  Livraria: [['bookstore', 'books_music_and_video_store'], ['livraria']],
  Tabacaria: [
    ['tobacco_shop', 'vape_shop'],
    ['tabacaria', 'headshop'],
  ],

  Hotel: [['hotel', 'motel', 'lodging'], ['hotel']],
  Pousada: [['bed_and_breakfast', 'hostel', 'guest_house', 'holiday_rental_home'], ['pousada']],
  'Salão de festas': [
    ['event_venue', 'party_and_event_planning', 'kids_recreation_and_party', 'wedding_planning'],
    ['salao de festas', 'espaco de eventos'],
  ],
  Buffet: [['caterer', 'buffet_restaurant'], ['buffet']],
  'Artigos para festas': [['party_supply_store', 'costume_store'], ['artigos para festa']],
}
