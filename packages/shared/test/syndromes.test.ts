import { describe, expect, it } from 'vitest';
import { classifySyndromes, primarySyndrome } from '../src/clinical/syndromes.js';

const d = (days: number) => days * 24;

describe('IDSP syndrome classification', () => {
  it('classifies fever under 7 days as acute febrile illness', () => {
    const match = primarySyndrome({ symptoms: { FEVER: d(2) } });
    expect(match?.code).toBe('AFI');
    expect(match?.reference).toContain('IDSP');
  });

  it('promotes fever beyond 7 days to prolonged fever', () => {
    const match = primarySyndrome({ symptoms: { FEVER: d(9) } });
    expect(match?.code).toBe('PROLONGED_FEVER');
  });

  it('ranks haemorrhagic fever above every other match', () => {
    const matches = classifySyndromes({ symptoms: { FEVER: d(3), GUM_BLEED: d(1) } });
    expect(matches[0]?.code).toBe('AHF');
    expect(matches.map((m) => m.code)).toContain('AFI');
  });

  it('separates SARI from ILI on shortness of breath', () => {
    const ili = primarySyndrome({ symptoms: { FEVER: d(1), COUGH: d(2) } });
    expect(ili?.code).toBe('ILI');

    const sari = primarySyndrome({ symptoms: { FEVER: d(1), COUGH: d(2), SOB: d(1) } });
    expect(sari?.code).toBe('SARI');
  });

  it('treats vomiting with dehydration as acute diarrhoeal disease', () => {
    const codes = classifySyndromes({ symptoms: { VOMITING: d(1), DEHYDRATION: d(1) } }).map((m) => m.code);
    expect(codes).toContain('ADD');
  });

  it('flags any bite as envenomation', () => {
    const match = primarySyndrome({ symptoms: {}, biteTypes: ['SNAKE'] });
    expect(match?.code).toBe('ENVENOMATION');
    expect(match?.notifiable).toBe(true);
  });

  it('does not classify heat illness when diarrhoea explains the dehydration', () => {
    const codes = classifySyndromes({ symptoms: { DEHYDRATION: d(1), DIARRHOEA: d(1) } }).map((m) => m.code);
    expect(codes).toContain('ADD');
    expect(codes).not.toContain('HEAT_ILLNESS');
  });

  it('returns nothing for an asymptomatic walk-in', () => {
    expect(classifySyndromes({ symptoms: {} })).toEqual([]);
  });
});
