import { ProofingService } from './proofing.service';

describe('ProofingService', () => {
  const service = new ProofingService();

  it('reports repeated spaces with a single-space replacement', () => {
    expect(service.inspect('hello  world')).toMatchObject([{ category: 'spacing', original: '  ', replacement: ' ' }]);
  });

  it('reports adjacent repeated tokens without changing the document', () => {
    expect(service.inspect('বাংলা বাংলা')).toMatchObject([{ category: 'repetition', original: 'বাংলা বাংলা', replacement: 'বাংলা' }]);
  });

  it('reports unexpected control characters', () => {
    expect(service.inspect('a\u0001b')[0]).toMatchObject({ category: 'unicode', original: '\u0001', offset: 1 });
  });
});