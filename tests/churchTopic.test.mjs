// Which questions the Assistant treats as about the church, the Bible and
// faith, or FaithSync (src/app/lib/nlp.ts isChurchTopic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChurchTopic, detectIntent } from '../src/app/lib/nlp.ts';

test('"what can you do" and asking for suggestions get the help answer', () => {
  for (const q of [
    'What can you do?',
    'what can you do? suggest',
    'What can you do? Any suggestions please',
    'suggest',
    'Give me examples',
    'any suggestions?',
    'Who are you?',
    'Ano ang kaya mong gawin?',
    'magbigay ng halimbawa',
  ]) assert.equal(detectIntent(q).kind, 'help', q);
  assert.notEqual(detectIntent('Suggest a verse about hope').kind, 'help');
});

test('church, faith and FaithSync questions are on topic', () => {
  for (const q of [
    'What is the confession of faith?',
    'What time is the Sunday service?',
    'Who is Jesus?',
    'What does the Bible say about prayer?',
    'How do I join a ministry?',
    'What is in chapter 21?',
    'How do I change my password?',
    'Anong oras ang pagsamba sa Linggo?',
    'Ano ang kaligtasan?',
    'Who was Abraham?',
  ]) assert.equal(isChurchTopic(q), true, q);
});

test('everyday questions are off topic', () => {
  for (const q of [
    'What should I eat?',
    'Who won the basketball game?',
    'How do I bake bread?',
    'What is the weather tomorrow?',
    'Recommend a good movie',
    'How much is a new phone?',
  ]) assert.equal(isChurchTopic(q), false, q);
});

test('"show more" and similar continue the previous answer', async () => {
  const { isMoreRequest } = await import('../src/app/lib/nlp.ts');
  for (const q of ['show more', 'Show me more', 'see more', 'read more', 'tell me more', 'keep going', 'next part', 'what else?', 'ipakita pa', 'ituloy pa po'])
    assert.equal(isMoreRequest(q), true, q);
  assert.equal(isMoreRequest('show more about prayer'), false);
});

test('section headings become related questions', async () => {
  const { headingQuestion } = await import('../src/app/lib/nlp.ts');
  assert.deepEqual(headingQuestion('Chapter 29: Of Baptism'), { label: 'Chapter 29: Baptism', question: 'What is in chapter 29?' });
  assert.deepEqual(headingQuestion('XXX. Of the Lord’s Supper'), { label: 'Chapter 30: Lord’s Supper', question: 'What is in chapter 30?' });
  assert.deepEqual(headingQuestion('Article 4: Of Creation', false), { label: 'Creation', question: 'Tell me about creation' });
  assert.deepEqual(headingQuestion('THE CHRIST OF THE BIBLE'), { label: 'The Christ of the Bible', question: 'Tell me about The Christ of the Bible' });
  assert.equal(headingQuestion(''), null);
});

test('a table of contents is not used as an answer', async () => {
  const { looksLikeContents } = await import('../src/app/lib/nlp.ts');
  assert.equal(looksLikeContents('Chapter 23 The Christ of the Bible\nChapter 40 Effectual Calling\nChapter 41 Justification by Faith Alone\nChapter 42 Saving Faith\nPART SEVEN: ECCLESIOLOGY'), true);
  assert.equal(looksLikeContents('VII. BAPTISM AND THE LORD’S SUPPER\nChristian baptism is the immersion of a believer in water in the name of the Father, Son, and Holy Spirit.\nIt is prerequisite to church membership and the Lord’s Supper.\nThe Lord’s Supper is a symbolic act.'), false);
});
