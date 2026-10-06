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
 * The pipe changes no English (ADR-054): what Nest's own ValidationPipe
 * says, in the same order, and beside it an id for each, rendered in
 * another language by the filter.
 */
describe('TranslatingValidationPipe', () => {
  it('says in English exactly what ValidationPipe says', async () => {
    const ours = await refusal(new TranslatingValidationPipe(OPTIONS));
    const nests = await refusal(new ValidationPipe(OPTIONS));
    expect(ours.message).toEqual(nests.message);
  });

  it('renders each message in another language, the field named as the API names it', async () => {
    const { messages } = await refusal(new TranslatingValidationPipe(OPTIONS));
    const french = messages!.map((message) => translate(message, 'fr-CA'));

    expect(french).toHaveLength(messages!.length);
    expect(french.some((line) => line.includes('lines.0.quantity'))).toBe(true);
    expect(french.some((line) => line.includes('5'))).toBe(true);
    // Every one of them translated: none is still the English.
    messages!.forEach((message, index) =>
      expect(french[index]).not.toBe(message.message),
    );
  });
});
