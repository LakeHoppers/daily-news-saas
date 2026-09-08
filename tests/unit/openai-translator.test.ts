import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAITranslator } from '@/modules/ai/providers/openai-translator';
const input = { headline: 'Başlık', body: 'Metin', whyItMatters: 'Önem' };
afterEach(() => vi.unstubAllGlobals());
function respond(value: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))));
}
describe('OpenAITranslator output validation', () => {
  it.each([null, [], 4, {headline:12,body:'B',whyItMatters:'C'}, {headline:'A',body:{text:'B'},whyItMatters:'C'}, {headline:'A',body:'B',whyItMatters:true}, {headline:' ',body:'B',whyItMatters:'C'}, {headline:'A',body:'\n\t',whyItMatters:'C'}, {headline:'A',body:'B',whyItMatters:''}])('rejects malformed output %j', async value => {
    respond(value);
    await expect(new OpenAITranslator('test-key').translate(input)).rejects.toThrow('incomplete');
  });
  it('accepts complete strings', async () => {
    const output = {headline:'Headline',body:'Paragraph one.\n\nParagraph two.',whyItMatters:'Why'};
    respond(output);
    await expect(new OpenAITranslator('test-key').translate(input)).resolves.toEqual(output);
  });
});
