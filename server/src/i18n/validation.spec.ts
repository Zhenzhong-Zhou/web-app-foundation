import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsString, MaxLength, ValidateNested } from 'class-validator';

import { IsPositiveDecimal } from '../common/dto/decimal';
import { translate } from './translate';
import { TranslatingValidationPipe } from './validation';

class LineDto {
  @IsPositiveDecimal()
  quantity!: string;
}

class OrderDto {
  @IsString()
  @MaxLength(5)
  reference!: string;

  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

const OPTIONS = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
};
const BAD = { reference: 'TOO-LONG', lines: [{ quantity: '-1' }], stray: 1 };

async function refusal(pipe: ValidationPipe) {
  try {
    await pipe.transform(BAD, { type: 'body', metatype: OrderDto });
  } catch (error) {
    return (error as BadRequestException).getResponse() as {
      message: string[];
      messages?: Parameters<typeof translate>[0][];
    };
  }
  throw new Error('expected a refusal');
}

/**
 * A built-in rule's English is what Nest's own ValidationPipe says, in the
 * same order (ADR-054); a DTO's own rule says what to fix in words, its
 * sentence without Nest's path in front (#148). Beside each, an id,
 * rendered in another language by the filter.
 */
describe('TranslatingValidationPipe', () => {
  const QUANTITY =
    'Enter a number greater than zero, with up to 4 decimal places.';

  it('says a built-in rule as ValidationPipe does, and a DTO rule without its path', async () => {
    const ours = await refusal(new TranslatingValidationPipe(OPTIONS));
    const nests = await refusal(new ValidationPipe(OPTIONS));

    expect(nests.message).toContain(`lines.0.${QUANTITY}`);
    expect(ours.message).toEqual(
      nests.message.map((line) =>
        line === `lines.0.${QUANTITY}` ? QUANTITY : line,
      ),
    );
  });

  it('renders each message in another language, a built-in naming the field as the API does', async () => {
    const { messages } = await refusal(new TranslatingValidationPipe(OPTIONS));
    const french = messages!.map((message) => translate(message, 'fr-CA'));

    expect(french).toHaveLength(messages!.length);
    expect(french.some((line) => line.includes('reference'))).toBe(true);
    expect(french.some((line) => line.includes('5'))).toBe(true);
    expect(french).toContain(
      'Saisissez un nombre supérieur à zéro, d’au plus 4 décimales.',
    );
    // Every one of them translated: none is still the English.
    messages!.forEach((message, index) =>
      expect(french[index]).not.toBe(message.message),
    );
  });
});
