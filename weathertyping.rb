require 'nkf'
require 'natto'
require 'jumanpp_ruby'

class String
  def yomi
    NKF.nkf('-w -X', self)
       .tr('ァ-ン','ぁ-ん')
       .tr('０-９ａ-ｚＡ-Ｚ','0-9a-zA-Z')
       .tr('：；＜＞［］｛｝',':;<>[]{}')
       .tr('？！＄％＃＆＊＠￥','?!$%#&*@¥')
       .gsub(/[[:space:]]/, '')
       .gsub(/(〜|−|—)/, 'ー')
       .gsub(/[★☆※○×→←↑↓]/, '')
       .tr('･', '・')
       .tr('\\', '')
  end
end

class WeatherTyping
  def self.entry(question, format="txt")
    case format
    when /txt|TXT|text|TEXT/
      "#{question}\n#{self.yomi(question)}\n"
    when /xml|XML/
      "<Word>\n  <Display>#{question}</Display>\n  <Characters>#{self.yomi(question)}</Characters>\n</Word>\n"
    end
  end

  def self.yomi(sentence)
    y = ""
    JumanppRuby::Juman.new(force_single_path: :true).parse(sentence) do |word_juman|
      candidate = word_juman[1].to_s.yomi

      if candidate =~ KANJI_RE then # Jumanppでの解析失敗時→Mecabに回してもう一度ひらがなにしようと試みる
        tmp = ""
        Natto::MeCab.new('-Oyomi').parse(candidate) { |word_mecab| tmp = tmp + word_mecab.feature.to_s.chomp.yomi }
        candidate = tmp
      end

      y = "#{y}#{candidate}"
    end
    y
  end
end