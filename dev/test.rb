require 'minitest/autorun'
require_relative '../mastodon.rb'

class WeatherTypingTest < Minitest::Test
    def test_yomi
        assert_equal "きょうはいいてんき", "キョウハいいテンキ".japanease.hiragana
        assert_equal "https://SENBEI.seibe-holdings.com/~seibe2", "https://SENBEI.seibe-holdings.com/~seibe2".japanease.hiragana
        assert_equal "あーーーー", "あー—−〜".japanease.hiragana # すべて全角長音 <--- 全角長音，全角ダッシュ，全角ハイフン，全角波ダッシュ
        assert_equal "すぺーす変換，全角全角、半角半角。", "スペース変換，全角　全角、半角 半角。".japanease.hiragana
        assert_equal "そのまま：＋×÷＜＞<>", "そのまま：＋×÷＜＞<>".japanease.hiragana
        assert_equal "変な文字INTERNET", "変な文字𝑰𝑵𝑻𝑬𝑹𝑵𝑬𝑻".japanease.hiragana
        assert_equal "「じす郵便1はーと令和」", "｟〄〒①♡㋿』".japanease.hiragana
        assert_equal "", "†※☆김★●┓≦".japanease.hiragana
        assert_equal "(っ==c).。o", "(っ=﹏=c) .｡o○".japanease.hiragana
    end
    def test_keitaiso
        assert_equal "きょうはいいてんき", WeatherTyping.yomi("今日はいい天気")
        assert_equal "12.312．3／aBaB", WeatherTyping.yomi("12.3１２．３／aBａＢ")
        assert_equal "「」はのぞく・・・!", WeatherTyping.yomi("※『  』は除く…!")
        assert_equal "(*^^*)(^_^)^0^", WeatherTyping.yomi("(*^▽^*)(^_^)∈^0^∋")
        assert_equal "「うんえいじょうほう」「こしょうはっせい・ふっきゅうほう」めでぃあふぁいるのえつらん・とうこうができないじょうたいになっていましたが，ふっきゅうしました。ごめいわくをおかけしました。・えいきょうはんい：めでぃあふぁいるのとうこうと，いちぶがぞうのえつらんができない・げんいん：がいぶさーびすのしょうがい・きかん：2020/5/1622:03:18ー22:25:42（すいそく）・ふっきゅうほうほう：しぜんかいふく(@highemerly)", WeatherTyping.yomi("【運営情報】【故障発生・復旧報】メディアファイルの閲覧・投稿ができない状態になっていましたが，復旧しました。ご迷惑をおかけしました。 ・影響範 囲： メディアファイルの投稿と，一部画像の閲覧ができない ・原因：外部サービスの障害 ・期間：2020/5/16 22:03:18〜22:25:42 （推測） ・復旧方法： 自然回復 (@highemerly)")
    end
end