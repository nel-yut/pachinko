// 機能フラグ。検証機能の公開可否は、このファイルの値か、ビルド時の --no-verify で切り替える。
// （scripts/build.mjs --no-verify は verification を false に書き換え、検証ページ・検証コードを配布物から除く）
export const FEATURES = {
  verification: true,
};
