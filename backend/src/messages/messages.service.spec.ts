import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from 'src/prisma.service';
import { EventsGateway } from 'src/events/events.gateway';
import { directKey } from 'src/conversations/direct-key';

describe('MessagesService membership', () => {
  let service: MessagesService;
  const findUnique = jest.fn();

  beforeEach(async () => {
    findUnique.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: { conversation: { findUnique } } },
        { provide: EventsGateway, useValue: {} },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  it('rejects a user who is not a participant', async () => {
    findUnique.mockResolvedValue({
      directKey: directKey('member', 'peer'),
      users: [{ id: 'member' }, { id: 'peer' }],
    });
    await expect(
      service.validateUserConversation('conversation-id', 'other-user'),
    ).rejects.toThrow(NotFoundException);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'conversation-id' },
      select: { directKey: true, users: { select: { id: true } } },
    });
  });

  it('allows a participant', async () => {
    findUnique.mockResolvedValue({
      directKey: directKey('member', 'peer'),
      users: [{ id: 'member' }, { id: 'peer' }],
    });
    await expect(
      service.validateUserConversation('conversation-id', 'member'),
    ).resolves.toBeUndefined();
  });
});
