import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameService } from '../src/services/gameService.js';
import { GameLibraryService } from '../src/services/gameLibraryService.js';
import { createGameSchema } from '../src/validation/gameLibrary.js';

test('sequence game definitions validate and default the display mode', () => {
  const content = {
    template: 'sequence-ordering',
    title: 'Sequence',
    description: 'Sequence game',
    companion: 'Harf',
    companionAnimal: 'turtle',
    instructions: 'Order the items.',
    items: [
      { id: 'item-first', label: 'First', correctOrder: 1 },
      { id: 'item-second', label: 'Second', correctOrder: 2 }
    ],
    assetAssignments: []
  };
  const game = createGameSchema.parse({ gameId: 'sequence-game', content });
  assert.equal(game.content.sequenceOrderMode, 'random');
  assert.equal(createGameSchema.parse({
    gameId: 'sequence-game',
    content: { ...content, sequenceOrderMode: 'ordered' }
  }).content.sequenceOrderMode, 'ordered');
  assert.throws(() => createGameSchema.parse({
    gameId: 'sequence-game',
    content: { ...content, sequenceOrderMode: 'shuffle-maybe' }
  }));
});

test('new games can be created from the empty library defaults', () => {
  const content = {
    template: 'multiple-choice',
    title: 'Fresh game',
    description: 'A new game',
    companion: 'رفيق حرف',
    companionAnimal: '🐢',
    instructions: 'استمع جيدًا ثم أكمل النشاط.',
    questions: [{
      prompt: 'اختر الإجابة الصحيحة',
      options: ['أ', 'ب'],
      correctAnswerIndex: 0,
      optionImageAssetIds: [null, null]
    }],
    assetAssignments: []
  };

  assert.equal(createGameSchema.safeParse({ gameId: 'fresh-game', content }).success, true);
  assert.equal(createGameSchema.safeParse({
    gameId: 'fresh-sequence',
    content: {
      ...content,
      template: 'sequence-ordering',
      questions: [],
      items: [
        { id: 'item-1', label: 'عنصر 1', imageAssetId: null, correctOrder: 1 },
        { id: 'item-2', label: 'عنصر 2', imageAssetId: null, correctOrder: 2 }
      ]
    }
  }).success, true);
});

test('sequence preview preserves the configured ordered or random item mode', async () => {
  const items = [
    { id: 'item-first', label: 'First', imageAssetId: null, correctOrder: 1 },
    { id: 'item-second', label: 'Second', imageAssetId: null, correctOrder: 2 }
  ];
  const previewMode = async (sequenceOrderMode) => {
    const service = new GameLibraryService({
      repository: {
        async findDefinition(gameId) {
          return {
            gameId,
            publishedVersion: 0,
            draftContent: {
              template: 'sequence-ordering',
              title: 'Sequence',
              description: 'Sequence preview',
              companion: 'Harf',
              companionAnimal: 'turtle',
              instructions: 'Order the items.',
              items,
              ...(sequenceOrderMode ? { sequenceOrderMode } : {}),
              assetAssignments: [],
              questions: []
            }
          };
        }
      },
      mediaAssetService: { async listAssets() { return []; } },
      authService: null
    });
    return service.getDraftPreview('sequence-game');
  };

  assert.equal((await previewMode('ordered')).sequenceOrderMode, 'ordered');
  assert.equal((await previewMode('random')).sequenceOrderMode, 'random');
  assert.equal((await previewMode(undefined)).sequenceOrderMode, 'random');
});

test('draft previews serve mapped media through the protected admin asset route', async () => {
  const imageId = '507f1f77bcf86cd799439011';
  const draftContent = {
    template: 'multiple-choice',
    title: 'Word match',
    description: 'Choose a word.',
    companion: 'Harf',
    companionAnimal: 'turtle',
    instructions: 'Choose an answer.',
    questions: [{
      prompt: 'Where is the cat?',
      options: ['Cat', 'Dog'],
      correctAnswerIndex: 0,
      promptImageAssetId: imageId,
      optionImageAssetIds: [imageId, null]
    }],
    assetAssignments: [{ event: 'welcome', kind: 'image', assetId: imageId }]
  };
  const service = new GameLibraryService({
    repository: {
      async findDefinition(gameId) {
        return { gameId, publishedVersion: 0, draftContent };
      }
    },
    mediaAssetService: {
      async listAssets() {
        return [{
          id: imageId,
          kind: 'image',
          active: true,
          available: true,
          mimeType: 'image/png',
          altText: 'Cat'
        }];
      }
    },
    authService: null
  });

  const preview = await service.getDraftPreview('word-match');
  const adminPreviewUrl = `/api/v1/admin/assets/${imageId}/preview`;
  assert.equal(preview.questions[0].promptImageUrl, adminPreviewUrl);
  assert.deepEqual(preview.questions[0].optionImageUrls, [adminPreviewUrl, null]);
  assert.equal(preview.assets.welcome.imageUrl, adminPreviewUrl);
});

test('admin game preview scores the saved draft without recording parent data', async () => {
  const draftContent = {
    template: 'multiple-choice',
    questions: [{
      prompt: 'Choose the right answer.',
      options: ['Wrong', 'Right'],
      correctAnswerIndex: 1
    }]
  };
  const gameLibraryService = new GameLibraryService({
    repository: {
      async findDefinition(gameId) {
        return { gameId, publishedVersion: 0, draftContent };
      }
    },
    mediaAssetService: null,
    authService: null
  });
  const gameService = new GameService({ gameLibraryService });

  const result = await gameService.checkPreviewAnswer('draft-game', {
    questionIndex: 0,
    answerIndex: 1
  });

  assert.deepEqual(result, { correct: true });
});
