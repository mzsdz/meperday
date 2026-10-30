import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeVoiceDraft} from '../voice-input.js';
test('dictation inserts at a selected range while preserving the existing draft',()=>{
 assert.equal(mergeVoiceDraft('밥은',2,2,'절반만 먹었어').value,'밥은 절반만 먹었어');
 assert.equal(mergeVoiceDraft('밥 두 공기 먹었어',2,6,'한 공기').value,'밥 한 공기 먹었어');
 assert.equal(mergeVoiceDraft('기존 입력',0,5,'').value,'기존 입력');
});
test('interim recognition replaces the same spoken range instead of duplicating it',()=>{
 const base='밥은';assert.equal(mergeVoiceDraft(base,2,2,'절반').value,'밥은 절반');
 assert.equal(mergeVoiceDraft(base,2,2,'절반만 먹었어').value,'밥은 절반만 먹었어');
});
test('the message limit keeps typed content and does not leave a broken emoji',()=>{
 const full='가'.repeat(600);assert.deepEqual(mergeVoiceDraft(full,600,600,'추가 입력'),{value:full,truncated:true});
 const almost='가'.repeat(598);const result=mergeVoiceDraft(almost,598,598,'😀');assert.equal(result.value,almost);assert.equal(result.truncated,true);
 const cut=mergeVoiceDraft('가'.repeat(590),590,590,'나'.repeat(30));assert.equal(cut.value.length,600);assert.equal(cut.truncated,true);
});
