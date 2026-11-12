import { cityOptionLabel, parseInseeCodeQuery, sortCities } from './city';

describe('city helpers', () => {
  describe('sortCities()', () => {
    const parisWithSomeDistrictsAndOtherCities = [
      {
        nom: 'Paris',
        code: '75056',
        codeDepartement: '75',
        siren: '217500016',
        codeEpci: '200054781',
        codeRegion: '11',
        codesPostaux: [
          '75001',
          '75002',
          '75003',
          '75004',
          '75005',
          '75006',
          '75007',
          '75008',
          '75009',
          '75010',
          '75011',
          '75012',
          '75013',
          '75014',
          '75015',
          '75016',
          '75017',
          '75018',
          '75019',
          '75020',
          '75116',
        ],
        population: 2133111,
        _score: 9.662748379853596,
      },
      {
        nom: 'Paris 17e Arrondissement',
        code: '75117',
        codeDepartement: '75',
        codeRegion: '11',
        codesPostaux: ['75017'],
        population: 164413,
        _score: 0.6955215467721753,
      },
      {
        nom: 'Paris 13e Arrondissement',
        code: '75113',
        codeDepartement: '75',
        codeRegion: '11',
        codesPostaux: ['75013'],
        population: 178350,
        _score: 0.7321819371363548,
      },
      {
        nom: 'Paris 16e Arrondissement',
        code: '75116',
        codeDepartement: '75',
        codeRegion: '11',
        codesPostaux: ['75016', '75116'],
        population: 162061,
        _score: 0.6893347606534589,
      },
      {
        nom: 'Paris 11e Arrondissement',
        code: '75111',
        codeDepartement: '75',
        codeRegion: '11',
        codesPostaux: ['75011'],
        population: 142583,
        _score: 0.6380991228897013,
      },

      {
        nom: 'Parisot',
        code: '81202',
        codeDepartement: '81',
        siren: '218102028',
        codeEpci: '200066124',
        codeRegion: '76',
        codesPostaux: ['81310'],
        population: 985,
        _score: 0.5143649977206274,
      },

      {
        nom: 'Seyssinet-Pariset',
        code: '38485',
        codeDepartement: '38',
        siren: '213804859',
        codeEpci: '200040715',
        codeRegion: '84',
        codesPostaux: ['38170'],
        population: 11753,
        _score: 0.42839249471872404,
      },

      {
        nom: 'Paris 3e Arrondissement',
        code: '75103',
        codeDepartement: '75',
        codeRegion: '11',
        codesPostaux: ['75003'],
        population: 32793,
        _score: 0.3493035242613543,
      },
      {
        nom: 'Paris 4e Arrondissement',
        code: '75104',
        codeDepartement: '75',
        codeRegion: '11',
        codesPostaux: ['75004'],
        population: 28324,
        _score: 0.3375481045485381,
      },
    ];

    const marseilleWithSomeDistrictsAndOtherCities = [
      {
        nom: 'Marseille',
        code: '13055',
        codeDepartement: '13',
        siren: '211300553',
        codeEpci: '200054807',
        codeRegion: '93',
        codesPostaux: [
          '13001',
          '13002',
          '13003',
          '13004',
          '13005',
          '13006',
          '13007',
          '13008',
          '13009',
          '13010',
          '13011',
          '13012',
          '13013',
          '13014',
          '13015',
          '13016',
        ],
        population: 873076,
        _score: 4.888370183929102,
      },
      {
        nom: 'Marseillette',
        code: '11220',
        codeDepartement: '11',
        siren: '211102207',
        codeEpci: '200035715',
        codeRegion: '76',
        codesPostaux: ['11800'],
        population: 700,
        _score: 0.6156846868053317,
      },
      {
        nom: 'Marseille 13e Arrondissement',
        code: '13213',
        codeDepartement: '13',
        codeRegion: '93',
        codesPostaux: ['13013'],
        population: 92261,
        _score: 0.5978625994091884,
      },

      {
        nom: 'Marseille 14e Arrondissement',
        code: '13214',
        codeDepartement: '13',
        codeRegion: '93',
        codesPostaux: ['13014'],
        population: 59948,
        _score: 0.49738078471609354,
      },
      {
        nom: 'Marseille 11e Arrondissement',
        code: '13211',
        codeDepartement: '13',
        codeRegion: '93',
        codesPostaux: ['13011'],
        population: 57924,
        _score: 0.49108687226788933,
      },
      {
        nom: 'Marseille 3e Arrondissement',
        code: '13203',
        codeDepartement: '13',
        codeRegion: '93',
        codesPostaux: ['13003'],
        population: 53115,
        _score: 0.47613261092232895,
      },
      {
        nom: 'Marseilles-lès-Aubigny',
        code: '18139',
        codeDepartement: '18',
        siren: '211801394',
        codeEpci: '200011781',
        codeRegion: '24',
        codesPostaux: ['18320'],
        population: 649,
        _score: 0.4723195747706068,
      },
      {
        nom: 'Marseille 2e Arrondissement',
        code: '13202',
        codeDepartement: '13',
        codeRegion: '93',
        codesPostaux: ['13002'],
        population: 23627,
        _score: 0.3844355307480962,
      },
      {
        nom: 'Marseille-en-Beauvaisis',
        code: '60387',
        codeDepartement: '60',
        siren: '216003830',
        codeEpci: '246000848',
        codeRegion: '32',
        codesPostaux: ['60690'],
        population: 1443,
        _score: 0.3013263837816966,
      },
    ];

    const lyonWithSomeDistrictsAndOtherCities = [
      {
        nom: 'Lyon',
        code: '69123',
        codeDepartement: '69',
        siren: '216901231',
        codeEpci: '200046977',
        codeRegion: '84',
        codesPostaux: [
          '69001',
          '69002',
          '69003',
          '69004',
          '69005',
          '69006',
          '69007',
          '69008',
          '69009',
        ],
        population: 522250,
        _score: 3.32657683365928,
      },
      {
        nom: 'Lyon 3e Arrondissement',
        code: '69383',
        codeDepartement: '69',
        codeRegion: '84',
        codesPostaux: ['69003'],
        population: 101302,
        _score: 0.6814104648417859,
      },

      {
        nom: 'Lyon 5e Arrondissement',
        code: '69385',
        codeDepartement: '69',
        codeRegion: '84',
        codesPostaux: ['69005'],
        population: 48711,
        _score: 0.5033890951758393,
      },
      {
        nom: 'Lyon 4e Arrondissement',
        code: '69384',
        codeDepartement: '69',
        codeRegion: '84',
        codesPostaux: ['69004'],
        population: 35603,
        _score: 0.4590183071402206,
      },
      {
        nom: 'Cognat-Lyonne',
        code: '03080',
        codeDepartement: '03',
        siren: '210300802',
        codeEpci: '200071363',
        codeRegion: '84',
        codesPostaux: ['03110'],
        population: 708,
        _score: 0.4463920013847629,
      },
      {
        nom: 'Lyon 2e Arrondissement',
        code: '69382',
        codeDepartement: '69',
        codeRegion: '84',
        codesPostaux: ['69002'],
        population: 30485,
        _score: 0.44169379591300845,
      },
      {
        nom: 'Lyons-la-Forêt',
        code: '27377',
        codeDepartement: '27',
        siren: '212703771',
        codeEpci: '200070142',
        codeRegion: '28',
        codesPostaux: ['27480'],
        population: 704,
        _score: 0.4391054563842952,
      },
    ];

    it('sorts cities alphabetically', () => {
      expect(sortCities(parisWithSomeDistrictsAndOtherCities, 'paris')).toMatchSnapshot();
    });

    it('returns corresponding distrinct of paris at first position when district number is provided', () => {
      expect(sortCities(parisWithSomeDistrictsAndOtherCities, 'paris 3')[0].nom).toEqual(
        'Paris 3e Arrondissement',
      );
      expect(sortCities(parisWithSomeDistrictsAndOtherCities, 'paris 13')[0].nom).toEqual(
        'Paris 13e Arrondissement',
      );
    });

    it('returns corresponding distrinct of marseille at first position when district number is provided', () => {
      expect(sortCities(marseilleWithSomeDistrictsAndOtherCities, 'marseille 3')[0].nom).toEqual(
        'Marseille 3e Arrondissement',
      );
      expect(sortCities(marseilleWithSomeDistrictsAndOtherCities, 'marseille 13')[0].nom).toEqual(
        'Marseille 13e Arrondissement',
      );
    });

    it('returns corresponding distrinct of lyon at first position when district number is provided', () => {
      expect(sortCities(lyonWithSomeDistrictsAndOtherCities, 'lyon 2')[0].nom).toEqual(
        'Lyon 2e Arrondissement',
      );
    });

    it('returns corresponding distrinct at first position when district number is provided and city is uppercase', () => {
      expect(sortCities(parisWithSomeDistrictsAndOtherCities, 'PARIS 3')[0].nom).toEqual(
        'Paris 3e Arrondissement',
      );
    });
  });

  describe('former communes', () => {
    const gouffern = {
      nom: 'Gouffern en Auge',
      code: '61474',
      codesPostaux: ['61310'],
      codeDepartement: '61',
    };
    const exmes = {
      nom: 'Exmes',
      code: '61157',
      codesPostaux: ['61310'],
      codeDepartement: '61',
      communeActuelle: { code: '61474', nom: 'Gouffern en Auge' },
    };

    it('lists current communes before former ones', () => {
      expect(sortCities([exmes, gouffern], 'auge').map((city) => city.code)).toEqual([
        '61474',
        '61157',
      ]);
    });

    it('labels a former commune with the current commune it belongs to', () => {
      expect(cityOptionLabel(exmes, 'exmes')).toEqual('Exmes → Gouffern en Auge (61)');
      expect(cityOptionLabel(gouffern, 'gouffern')).toEqual('Gouffern en Auge (61)');
    });

    it('shows the searched INSEE code on a code lookup', () => {
      expect(cityOptionLabel(exmes, '#61157')).toEqual(
        'Exmes → Gouffern en Auge (61) · INSEE 61157',
      );
    });
  });

  describe('parseInseeCodeQuery()', () => {
    it('reads a "#"-prefixed INSEE code, Corsican ones included', () => {
      expect(parseInseeCodeQuery('#61157')).toEqual('61157');
      expect(parseInseeCodeQuery(' # 2a004 ')).toEqual('2A004');
    });

    it('ignores a bare number, a commune name and a malformed code', () => {
      expect(parseInseeCodeQuery('61310')).toBeNull();
      expect(parseInseeCodeQuery('Exmes')).toBeNull();
      expect(parseInseeCodeQuery('#6131')).toBeNull();
    });
  });
});
