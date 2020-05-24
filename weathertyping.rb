require 'nkf'
require 'natto'
require 'jumanpp_ruby'

MORPHOLOGICAL_ANALYZER = "MECAB" # MECAB, JUMANPP

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
  def self.entry(question, username, format="txt")
    case format
    when /txt|TXT|text|TEXT/
      "#{question} (@#{username})\n#{self.yomi(question, MORPHOLOGICAL_ANALYZER)}\n"
    when /xml|XML/
      "<Word>\n  <Display>#{question} (@#{username})</Display>\n  <Characters>#{self.yomi(question, MORPHOLOGICAL_ANALYZER)}</Characters>\n</Word>\n"
    end
  end

  def self.yomi(sentence, morphological="MECAB")
    case morphological
    when "MECAB"
      Natto::MeCab.new('-Oyomi').parse(sentence).to_s.chomp.yomi
    when "JUMANPP"
      yomi = ""
      JumanppRuby::Juman.new(force_single_path: :true).parse(sentence) { |word| yomi = yomi + word[1].to_s.yomi }
      yomi
    end
  end

end