// Codes COG issus du Code officiel géographique de l'Insee, millésime 2026.
// Sources (copiées telles quelles dans __fixtures__, cf. countries.spec.ts) :
// https://www.insee.fr/fr/statistiques/fichier/8740222/v_pays_territoire_2026.csv
// https://www.insee.fr/fr/statistiques/fichier/8740222/v_pays_et_territoire_depuis_1943.csv
// L'Insee donne le COG de la France (99100) aux territoires d'outre-mer ; on leur met
// plutôt leur code département / collectivité (971-988). Les États disparus portent
// leur COG historique.
// The only country the birthplace question is asked for, and the only one LCA accepts a
// commune de naissance with.
export const FRANCE_ISO_CODE = 'FR';

export const countries = [
  {
    isoCode: 'KH',
    label: 'Cambodge',
    cog: '99234',
  },
  {
    isoCode: 'CH',
    label: 'Suisse',
    cog: '99140',
  },
  {
    isoCode: 'NG',
    label: 'Nigéria',
    cog: '99338',
  },
  {
    isoCode: 'CZ',
    label: 'République tchèque',
    cog: '99116',
  },
  {
    isoCode: 'UZ',
    label: 'Ouzbékistan',
    cog: '99258',
  },
  {
    isoCode: 'GF',
    label: 'Guyane française',
    cog: '973',
  },
  {
    isoCode: 'DE',
    label: 'Allemagne',
    cog: '99109',
  },
  {
    isoCode: 'BH',
    label: 'Bahreïn',
    cog: '99249',
  },
  {
    isoCode: 'MH',
    label: 'Iles Marshall',
    cog: '99515',
  },
  {
    isoCode: 'VE',
    label: 'Venezuela, Rép. bolivarienne du',
    cog: '99424',
  },
  {
    isoCode: 'RE',
    label: 'Réunion',
    cog: '974',
  },
  {
    isoCode: 'GY',
    label: 'Guyana',
    cog: '99428',
  },
  {
    isoCode: 'BI',
    label: 'Burundi',
    cog: '99321',
  },
  {
    isoCode: 'KI',
    label: 'Kiribati',
    cog: '99513',
  },
  {
    isoCode: 'JO',
    label: 'Jordanie',
    cog: '99222',
  },
  {
    isoCode: 'AU',
    label: 'Australie',
    cog: '99501',
  },
  {
    isoCode: 'EH',
    label: 'Sahara occidental',
    cog: '99389',
  },
  {
    isoCode: 'GE',
    label: 'Géorgie',
    cog: '99255',
  },
  {
    isoCode: 'LU',
    label: 'Luxembourg',
    cog: '99137',
  },
  {
    isoCode: 'JP',
    label: 'Japon',
    cog: '99217',
  },
  {
    isoCode: 'BO',
    label: 'Bolivie',
    cog: '99418',
  },
  {
    isoCode: 'D2',
    label: 'Allemagne, Rép. Féd. avant le 3.10.1990',
    cog: '99142',
  },
  {
    isoCode: 'AL',
    label: 'Albanie',
    cog: '99125',
  },
  {
    isoCode: 'ME',
    label: 'Monténégro',
    cog: '99120',
  },
  {
    isoCode: 'US',
    label: 'Etats-Unis',
    cog: '99404',
  },
  {
    isoCode: 'BA',
    label: 'Bosnie-Herzégovine',
    cog: '99118',
  },
  {
    isoCode: 'PG',
    label: 'Papouasie-Nouvelle-Guinée',
    cog: '99510',
  },
  {
    isoCode: 'LV',
    label: 'Lettonie',
    cog: '99107',
  },
  {
    isoCode: 'AG',
    label: 'Antigua-et-Barbuda',
    cog: '99441',
  },
  {
    isoCode: 'AR',
    label: 'Argentine',
    cog: '99415',
  },
  {
    isoCode: 'RO',
    label: 'Roumanie',
    cog: '99114',
  },
  {
    isoCode: 'PS',
    label: 'Rive occidentale et Bande de Gaza',
    cog: '99261',
  },
  {
    isoCode: 'JM',
    label: 'Jamaïque',
    cog: '99426',
  },
  {
    isoCode: 'MV',
    label: 'Maldives',
    cog: '99229',
  },
  {
    isoCode: 'GW',
    label: 'Guinée-Bissau',
    cog: '99392',
  },
  {
    isoCode: 'MR',
    label: 'Mauritanie',
    cog: '99336',
  },
  {
    isoCode: 'IR',
    label: "Iran, Rép. islamique d'",
    cog: '99204',
  },
  {
    isoCode: 'GM',
    label: 'Gambie',
    cog: '99304',
  },
  {
    isoCode: 'NC',
    label: 'Nouvelle-Calédonie',
    cog: '988',
  },
  {
    isoCode: 'KS',
    label: 'Kosovo',
    cog: '99157',
  },
  {
    isoCode: 'SD',
    label: 'Soudan, République du',
    cog: '99343',
  },
  {
    isoCode: 'NU',
    label: 'Nioué',
    cog: '99521',
  },
  {
    isoCode: 'D3',
    label: 'Allemagne, 5 nouveaux Länder et Berlin-Est',
    cog: '99141',
  },
  {
    isoCode: 'BZ',
    label: 'Belize',
    cog: '99429',
  },
  {
    isoCode: 'IT',
    label: 'Italie',
    cog: '99127',
  },
  {
    isoCode: 'FI',
    label: 'Finlande',
    cog: '99105',
  },
  {
    isoCode: 'PY',
    label: 'Paraguay',
    cog: '99421',
  },
  {
    isoCode: 'AF',
    label: 'Afghanistan',
    cog: '99212',
  },
  {
    isoCode: 'AE',
    label: 'Emirats arabes unis',
    cog: '99247',
  },
  {
    isoCode: 'PE',
    label: 'Pérou',
    cog: '99422',
  },
  {
    isoCode: 'CG',
    label: 'Congo',
    cog: '99324',
  },
  {
    isoCode: 'HN',
    label: 'Honduras',
    cog: '99411',
  },
  {
    isoCode: 'VI',
    label: 'Iles Vierges américaines',
    cog: '99432',
  },
  {
    isoCode: 'CK',
    label: 'Iles Cook',
    cog: '99520',
  },
  {
    isoCode: 'SL',
    label: 'Sierra Leone',
    cog: '99342',
  },
  {
    isoCode: 'M1',
    label: 'Malaisie: Malaisie péninsulaire',
    cog: '99227',
  },
  {
    isoCode: 'SE',
    label: 'Suède',
    cog: '99104',
  },
  {
    isoCode: 'PK',
    label: 'Pakistan',
    cog: '99213',
  },
  {
    isoCode: 'KY',
    label: 'Iles Caïmanes',
    cog: '99425',
  },
  {
    isoCode: 'MC',
    label: 'Monaco',
    cog: '99138',
  },
  {
    isoCode: 'BS',
    label: 'Bahamas',
    cog: '99436',
  },
  {
    isoCode: 'E1',
    label: "Ethiopie (y compris l'Erythrée)",
    cog: '99315',
  },
  {
    isoCode: 'CO',
    label: 'Colombie',
    cog: '99419',
  },
  {
    isoCode: 'SV',
    label: 'El Salvador',
    cog: '99414',
  },
  {
    isoCode: 'PH',
    label: 'Philippines',
    cog: '99220',
  },
  {
    isoCode: 'BN',
    label: 'Brunéi Darussalam',
    cog: '99225',
  },
  {
    isoCode: 'BR',
    label: 'Brésil',
    cog: '99416',
  },
  {
    isoCode: 'NO',
    label: 'Norvège',
    cog: '99103',
  },
  {
    isoCode: 'GA',
    label: 'Gabon',
    cog: '99328',
  },
  {
    isoCode: 'T2',
    label: 'Tanzanie (Zanzibar)',
    cog: '99362',
  },
  {
    isoCode: 'IQ',
    label: 'Iraq',
    cog: '99203',
  },
  {
    isoCode: 'SU',
    label: 'URSS',
    cog: '99123',
  },
  {
    isoCode: 'DJ',
    label: 'Djibouti',
    cog: '99399',
  },
  {
    isoCode: 'PL',
    label: 'Pologne',
    cog: '99122',
  },
  {
    isoCode: 'SO',
    label: 'Somalie',
    cog: '99318',
  },
  {
    isoCode: 'NL',
    label: 'Pays-Bas',
    cog: '99135',
  },
  {
    isoCode: 'TN',
    label: 'Tunisie',
    cog: '99351',
  },
  {
    isoCode: 'CY',
    label: 'Chypre',
    cog: '99254',
  },
  {
    isoCode: 'M3',
    label: 'Malaisie: Sarawak',
    cog: '99227',
  },
  {
    isoCode: 'KP',
    label: 'Corée, Rép. pop. dém. de',
    cog: '99238',
  },
  {
    isoCode: 'D1',
    label: 'Allemagne, Ancienne Rép. dém. allemande',
    cog: '99141',
  },
  {
    isoCode: 'GI',
    label: 'Gibraltar',
    cog: '99133',
  },
  {
    isoCode: 'TW',
    label: 'Taïwan, Chine',
    cog: '99236',
  },
  {
    isoCode: 'CD',
    label: 'Congo, Rép. dém. du',
    cog: '99312',
  },
  {
    isoCode: 'MP',
    label: 'Iles Mariannes du Nord',
    cog: '99505',
  },
  {
    isoCode: 'ET',
    label: 'Ethiopie',
    cog: '99315',
  },
  {
    isoCode: 'AT',
    label: 'Autriche',
    cog: '99110',
  },
  {
    isoCode: 'CN',
    label: 'Chine',
    cog: '99216',
  },
  {
    isoCode: 'SN',
    label: 'Sénégal',
    cog: '99341',
  },
  {
    isoCode: 'NF',
    label: 'Ile Norfolk',
    cog: '99522',
  },
  {
    isoCode: 'KN',
    label: 'Saint-Kitts-et-Nevis',
    cog: '99442',
  },
  {
    isoCode: 'BT',
    label: 'Bhoutan',
    cog: '99214',
  },
  {
    isoCode: 'PW',
    label: 'Palau',
    cog: '99517',
  },
  {
    isoCode: 'KZ',
    label: 'Kazakhstan',
    cog: '99256',
  },
  {
    isoCode: 'BJ',
    label: 'Bénin',
    cog: '99327',
  },
  {
    isoCode: 'AW',
    label: 'Aruba',
    cog: '99431',
  },
  {
    isoCode: 'CS',
    label: 'Serbie-et-Monténégro',
    cog: '99121',
  },
  {
    isoCode: 'DO',
    label: 'République dominicaine',
    cog: '99408',
  },
  {
    isoCode: 'Y1',
    label: 'Yémen, Ancienne Rép. arabe du',
    cog: '99202',
  },
  {
    isoCode: 'LB',
    label: 'Liban',
    cog: '99205',
  },
  {
    isoCode: 'LR',
    label: 'Libéria',
    cog: '99302',
  },
  {
    isoCode: 'AZ',
    label: 'Azerbaïdjan',
    cog: '99253',
  },
  {
    isoCode: 'ES',
    label: 'Espagne',
    cog: '99134',
  },
  {
    isoCode: 'QA',
    label: 'Qatar',
    cog: '99248',
  },
  {
    isoCode: 'OM',
    label: 'Oman',
    cog: '99250',
  },
  {
    isoCode: 'SK',
    label: 'Slovaquie',
    cog: '99117',
  },
  {
    isoCode: 'CV',
    label: 'Cap-Vert',
    cog: '99396',
  },
  {
    isoCode: 'GB',
    label: 'Royaume-Uni',
    cog: '99132',
  },
  {
    isoCode: 'YE',
    label: 'Yémen',
    cog: '99251',
  },
  {
    isoCode: 'M2',
    label: 'Malaisie: Sabah',
    cog: '99227',
  },
  {
    isoCode: 'IM',
    label: 'Ile de Man',
    cog: '99161',
  },
  {
    isoCode: 'TC',
    label: 'Iles Turques et Caïques',
    cog: '99425',
  },
  {
    isoCode: 'LY',
    label: 'Jamahiriya arabe libyenne',
    cog: '99316',
  },
  {
    isoCode: 'HR',
    label: 'Croatie',
    cog: '99119',
  },
  {
    isoCode: 'TG',
    label: 'Togo',
    cog: '99345',
  },
  {
    isoCode: 'SC',
    label: 'Seychelles',
    cog: '99398',
  },
  {
    isoCode: 'MO',
    label: 'Macao, Chine',
    cog: '99232',
  },
  {
    isoCode: 'UG',
    label: 'Ouganda',
    cog: '99339',
  },
  {
    isoCode: 'MA',
    label: 'Maroc',
    cog: '99350',
  },
  {
    isoCode: 'RU',
    label: 'Russie, Fédération de',
    cog: '99123',
  },
  {
    isoCode: 'VG',
    label: 'Iles Vierges britanniques',
    cog: '99425',
  },
  {
    isoCode: 'C1',
    label: 'Tchécoslovaquie',
    cog: '99115',
  },
  {
    isoCode: 'SB',
    label: 'Iles Salomon',
    cog: '99512',
  },
  {
    isoCode: 'BB',
    label: 'Barbade',
    cog: '99434',
  },
  {
    isoCode: 'IE',
    label: 'Irlande',
    cog: '99136',
  },
  {
    isoCode: 'CI',
    label: "Côte d'Ivoire",
    cog: '99326',
  },
  {
    isoCode: 'RW',
    label: 'Rwanda',
    cog: '99340',
  },
  {
    isoCode: 'TV',
    label: 'Tuvalu',
    cog: '99511',
  },
  {
    isoCode: 'SM',
    label: 'Saint-Marin',
    cog: '99128',
  },
  {
    isoCode: 'ER',
    label: 'Erythrée',
    cog: '99317',
  },
  {
    isoCode: 'GL',
    label: 'Groenland',
    cog: '99430',
  },
  {
    isoCode: 'TM',
    label: 'Turkménistan',
    cog: '99260',
  },
  {
    isoCode: 'KE',
    label: 'Kenya',
    cog: '99332',
  },
  {
    isoCode: 'TJ',
    label: 'Tadjikistan',
    cog: '99259',
  },
  {
    isoCode: 'AI',
    label: 'Anguilla',
    cog: '99425',
  },
  {
    isoCode: 'FO',
    label: 'Iles Féroé',
    cog: '99158',
  },
  {
    isoCode: 'MG',
    label: 'Madagascar',
    cog: '99333',
  },
  {
    isoCode: 'LI',
    label: 'Liechtenstein',
    cog: '99113',
  },
  {
    isoCode: 'SZ',
    label: 'Swaziland',
    cog: '99391',
  },
  {
    isoCode: 'WF',
    label: 'Iles Wallis et Futuna',
    cog: '986',
  },
  {
    isoCode: 'TH',
    label: 'Thaïlande',
    cog: '99219',
  },
  {
    isoCode: 'TL',
    label: 'Timor-Leste',
    cog: '99262',
  },
  {
    isoCode: 'BE',
    label: 'Belgique',
    cog: '99131',
  },
  {
    isoCode: 'IS',
    label: 'Islande',
    cog: '99102',
  },
  {
    isoCode: 'BG',
    label: 'Bulgarie',
    cog: '99111',
  },
  {
    isoCode: 'SS',
    label: 'Soudan du Sud',
    cog: '99349',
  },
  {
    isoCode: 'TR',
    label: 'Turquie',
    cog: '99208',
  },
  {
    isoCode: 'MW',
    label: 'Malawi',
    cog: '99334',
  },
  {
    isoCode: 'GN',
    label: 'Guinée',
    cog: '99330',
  },
  {
    isoCode: 'MY',
    label: 'Malaisie',
    cog: '99227',
  },
  {
    isoCode: 'CF',
    label: 'République centrafricaine',
    cog: '99323',
  },
  {
    isoCode: 'DZ',
    label: 'Algérie',
    cog: '99352',
  },
  {
    isoCode: 'GU',
    label: 'Guam',
    cog: '99505',
  },
  {
    isoCode: 'GD',
    label: 'Grenade',
    cog: '99435',
  },
  {
    isoCode: 'FR',
    label: 'France',
    cog: '99100',
  },
  {
    isoCode: 'MZ',
    label: 'Mozambique',
    cog: '99393',
  },
  {
    isoCode: 'EE',
    label: 'Estonie',
    cog: '99106',
  },
  {
    isoCode: 'CL',
    label: 'Chili',
    cog: '99417',
  },
  {
    isoCode: 'PR',
    label: 'Porto Rico',
    cog: '99432',
  },
  {
    isoCode: 'CR',
    label: 'Costa Rica',
    cog: '99406',
  },
  {
    isoCode: 'AM',
    label: 'Arménie',
    cog: '99252',
  },
  {
    isoCode: 'GG',
    label: 'Guernesey',
    cog: '99161',
  },
  {
    isoCode: 'EC',
    label: 'Equateur',
    cog: '99420',
  },
  {
    isoCode: 'NI',
    label: 'Nicaragua',
    cog: '99412',
  },
  {
    isoCode: 'CU',
    label: 'Cuba',
    cog: '99407',
  },
  {
    isoCode: 'KW',
    label: 'Koweït',
    cog: '99240',
  },
  {
    isoCode: 'PT',
    label: 'Portugal',
    cog: '99139',
  },
  {
    isoCode: 'Y2',
    label: 'Yémen, Ancien Yémen démocratique',
    cog: '99233',
  },
  {
    isoCode: 'GR',
    label: 'Grèce',
    cog: '99126',
  },
  {
    isoCode: 'FK',
    label: 'Iles Falkland (Malvinas)',
    cog: '99427',
  },
  {
    isoCode: 'MD',
    label: 'Moldova, République de',
    cog: '99151',
  },
  {
    isoCode: 'GT',
    label: 'Guatemala',
    cog: '99409',
  },
  {
    isoCode: 'AO',
    label: 'Angola',
    cog: '99395',
  },
  {
    isoCode: 'VN',
    label: 'Viet Nam',
    cog: '99243',
  },
  {
    isoCode: 'RS',
    label: 'Serbie',
    cog: '99121',
  },
  {
    isoCode: 'KM',
    label: 'Comores',
    cog: '99397',
  },
  {
    isoCode: 'GH',
    label: 'Ghana',
    cog: '99329',
  },
  {
    isoCode: 'TZ',
    label: 'Tanzanie, République-Unie de',
    cog: '99309',
  },
  {
    isoCode: 'MQ',
    label: 'Martinique',
    cog: '972',
  },
  {
    isoCode: 'SR',
    label: 'Suriname',
    cog: '99437',
  },
  {
    isoCode: 'ZM',
    label: 'Zambie',
    cog: '99346',
  },
  {
    isoCode: 'AN',
    label: 'Antilles néerlandaises',
    cog: '99431',
  },
  {
    isoCode: 'Y3',
    label: 'Yougoslavie, Ancienne Rép. socialiste de',
    cog: '99121',
  },
  {
    isoCode: 'MM',
    label: 'Myanmar',
    cog: '99224',
  },
  {
    isoCode: 'GP',
    label: 'Guadeloupe',
    cog: '971',
  },
  {
    isoCode: 'MX',
    label: 'Mexique',
    cog: '99405',
  },
  {
    isoCode: 'MU',
    label: 'Maurice',
    cog: '99390',
  },
  {
    isoCode: 'SA',
    label: 'Arabie saoudite',
    cog: '99201',
  },
  {
    isoCode: 'LK',
    label: 'Sri Lanka',
    cog: '99235',
  },
  {
    isoCode: 'NR',
    label: 'Nauru',
    cog: '99507',
  },
  {
    isoCode: 'MK',
    label: 'Macédoine, Ex-Rép. yougoslave de',
    cog: '99156',
  },
  {
    isoCode: 'BW',
    label: 'Botswana',
    cog: '99347',
  },
  {
    isoCode: 'TK',
    label: 'Tokélaou',
    cog: '99519',
  },
  {
    isoCode: 'HK',
    label: 'Hong-kong, Chine',
    cog: '99230',
  },
  {
    isoCode: 'SG',
    label: 'Singapour',
    cog: '99226',
  },
  {
    isoCode: 'KR',
    label: 'Corée, République de',
    cog: '99239',
  },
  {
    isoCode: 'ML',
    label: 'Mali',
    cog: '99335',
  },
  {
    isoCode: 'AS',
    label: 'Samoa américaines',
    cog: '99505',
  },
  {
    isoCode: 'LT',
    label: 'Lituanie',
    cog: '99108',
  },
  {
    isoCode: 'ZA',
    label: 'Afrique du Sud',
    cog: '99303',
  },
  {
    isoCode: 'SH',
    label: 'Sainte-Hélène',
    cog: '99306',
  },
  {
    isoCode: 'NA',
    label: 'Namibie',
    cog: '99311',
  },
  {
    isoCode: 'AD',
    label: 'Andorre',
    cog: '99130',
  },
  {
    isoCode: 'NP',
    label: 'Népal',
    cog: '99215',
  },
  {
    isoCode: 'UY',
    label: 'Uruguay',
    cog: '99423',
  },
  {
    isoCode: 'LC',
    label: 'Sainte-Lucie',
    cog: '99439',
  },
  {
    isoCode: 'VU',
    label: 'Vanuatu',
    cog: '99514',
  },
  {
    isoCode: 'ST',
    label: 'Sao Tomé-et-Principe',
    cog: '99394',
  },
  {
    isoCode: 'TD',
    label: 'Tchad',
    cog: '99344',
  },
  {
    isoCode: 'NZ',
    label: 'Nouvelle-Zélande',
    cog: '99502',
  },
  {
    isoCode: 'CA',
    label: 'Canada',
    cog: '99401',
  },
  {
    isoCode: 'KG',
    label: 'Kirghizistan',
    cog: '99257',
  },
  {
    isoCode: 'JG',
    label: 'Iles Anglo-normandes',
    cog: '99161',
  },
  {
    isoCode: 'TT',
    label: 'Trinité-et-Tobago',
    cog: '99433',
  },
  {
    isoCode: 'GQ',
    label: 'Guinée équatoriale',
    cog: '99314',
  },
  {
    isoCode: 'PF',
    label: 'Polynésie française',
    cog: '987',
  },
  {
    isoCode: 'EG',
    label: 'Egypte',
    cog: '99301',
  },
  {
    isoCode: 'WS',
    label: 'Samoa',
    cog: '99506',
  },
  {
    isoCode: 'BY',
    label: 'Bélarus',
    cog: '99148',
  },
  {
    isoCode: 'PA',
    label: 'Panama',
    cog: '99413',
  },
  {
    isoCode: 'HT',
    label: 'Haïti',
    cog: '99410',
  },
  {
    isoCode: 'BD',
    label: 'Bangladesh',
    cog: '99246',
  },
  {
    isoCode: 'MT',
    label: 'Malte',
    cog: '99144',
  },
  {
    isoCode: 'IL',
    label: 'Israël',
    cog: '99207',
  },
  {
    isoCode: 'LS',
    label: 'Lesotho',
    cog: '99348',
  },
  {
    isoCode: 'LA',
    label: 'République dém. pop. lao',
    cog: '99241',
  },
  {
    isoCode: 'BF',
    label: 'Burkina Faso',
    cog: '99331',
  },
  {
    isoCode: 'VC',
    label: 'Saint-Vincent-et-les Grenadines',
    cog: '99440',
  },
  {
    isoCode: 'PM',
    label: 'Saint-Pierre-et-Miquelon',
    cog: '975',
  },
  {
    isoCode: 'SI',
    label: 'Slovénie',
    cog: '99145',
  },
  {
    isoCode: 'T1',
    label: 'Tanzanie (Tanganyika)',
    cog: '99309',
  },
  {
    isoCode: 'UA',
    label: 'Ukraine',
    cog: '99155',
  },
  {
    isoCode: 'ZW',
    label: 'Zimbabwe',
    cog: '99310',
  },
  {
    isoCode: 'SY',
    label: 'République arabe syrienne',
    cog: '99206',
  },
  {
    isoCode: 'TO',
    label: 'Tonga',
    cog: '99509',
  },
  {
    isoCode: 'IN',
    label: 'Inde',
    cog: '99223',
  },
  {
    isoCode: 'JE',
    label: 'Jersey',
    cog: '99161',
  },
  {
    isoCode: 'MS',
    label: 'Montserrat',
    cog: '99425',
  },
  {
    isoCode: 'MN',
    label: 'Mongolie',
    cog: '99242',
  },
  {
    isoCode: 'HU',
    label: 'Hongrie',
    cog: '99112',
  },
  {
    isoCode: 'ID',
    label: 'Indonésie',
    cog: '99231',
  },
  {
    isoCode: 'BM',
    label: 'Bermudes',
    cog: '99425',
  },
  {
    isoCode: 'DM',
    label: 'Dominique',
    cog: '99438',
  },
  {
    isoCode: 'NE',
    label: 'Niger',
    cog: '99337',
  },
  {
    isoCode: 'FJ',
    label: 'Fidji',
    cog: '99508',
  },
  {
    isoCode: 'CM',
    label: 'Cameroun',
    cog: '99322',
  },
  {
    isoCode: 'DK',
    label: 'Danemark',
    cog: '99101',
  },
  {
    isoCode: 'VA',
    label: 'Vatican',
    cog: '99129',
  },
  {
    isoCode: 'AX',
    label: 'Åland',
    cog: '99160',
  },
  {
    isoCode: 'IO',
    label: "Territoire britannique de l'océan Indien",
    cog: '99308',
  },
  {
    isoCode: 'BQ',
    label: 'Bonaire, Saint-Eustache, Saba',
    cog: '99443',
  },
  {
    isoCode: 'CW',
    label: 'Curaçao',
    cog: '99444',
  },
  {
    isoCode: 'SX',
    label: 'Saint-Martin (partie néerlandaise)',
    cog: '99445',
  },
  {
    isoCode: 'PN',
    label: 'Pitcairn',
    cog: '99503',
  },
  {
    isoCode: 'FM',
    label: 'Micronésie',
    cog: '99516',
  },
  {
    isoCode: 'AQ',
    label: 'Antarctique',
    cog: '99699',
  },
  {
    isoCode: 'YT',
    label: 'Mayotte',
    cog: '976',
  },
  {
    isoCode: 'BL',
    label: 'Saint-Barthélemy',
    cog: '977',
  },
  {
    isoCode: 'MF',
    label: 'Saint-Martin',
    cog: '978',
  },
  {
    isoCode: 'TF',
    label: 'Terres australes et antarctiques françaises',
    cog: '984',
  },
];
