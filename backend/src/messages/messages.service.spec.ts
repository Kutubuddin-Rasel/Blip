import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from 'src/prisma.service';
import { EventsGateway } from 'src/events/events.gateway';

describe('MessagesService membership', () => {
  let service: MessagesService;
  const findFirst = jest.fn();

  beforeEach(async () => {
    findFirst.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: { conversation: { findFirst } } },
        { provide: EventsGateway, useValue: {} },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  it('rejects a user who is not a participant', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      service.validateUserConversation('conversation-id', 'other-user'),
    ).rejects.toThrow(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'conversation-id',
        users: { some: { id: 'other-user' } },
      },
    });
  });

  it('allows a participant', async () => {
    findFirst.mockResolvedValue({ id: 'conversation-id' });
    await expect(
      service.validateUserConversation('conversation-id', 'member'),
    ).resolves.toBeUndefined();
  });
});
