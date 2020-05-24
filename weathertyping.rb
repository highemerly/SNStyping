require 'nkf'
require 'natto'
require 'jumanpp_ruby'

MORPHOLOGICAL_ANALYZER = "MECAB" # MECAB, JUMANPP

class String
  def japanease
    self.tr('０-９ａ-ｚＡ-Ｚ','0-9a-zA-Z')
        .gsub(/[[:space:]]/, '')
        .gsub(/‐|‑|−|‒|–|—|―|ー|〜|−/, 'ー')
        .tr('【】〈〉《》『』〔〕〖〗｟｠〘〙','「」「」「」「」「」「」「」「」')
        .gsub('/(‘|’|‛)', '\'')
        .gsub('/(“|”|‟)', '"')
        .tr('①-⑨➀-➈㈠-㈨⒈-⒐㊀-㊈', '1-91-91-91-91-9')
        .tr('𝐀-𝐙𝐚-𝐳𝐴-𝑍𝑎-𝑧𝑨-𝒁𝒂-𝒛', 'A-Za-zA-Za-zA-Za-z')
        .tr('𝔸-𝕐𝕒-𝕫𝕬-𝖅𝖆-𝖟𝘼-𝙕𝙖-𝙯', 'A-Ya-zA-Za-zA-Za-z')
        .gsub(/㍾|㍽|㍼|㍻|㋿/, "㍾" => "明治", "㍽" => "大正", "㍼" => "昭和", "㍻" => "平成", "㋿" => "令和")
        .gsub(/‼|⁇|⁈|⁉/, "‼" => "!!", "⁇" => "？？", "⁈" => "？！", "⁉" => "！？")
        .tr('･', '・')
        .gsub(/‥/, '・・')
        .gsub(/…/, '・・・')
        .gsub(/♡|♥|♥︎|❤︎/, 'ハート')
        .gsub(/〄/, 'じす')
        .gsub(/〆/, 'しめ')
        .gsub(/(〒|〠|〶)/, '郵便')
        .gsub(/[ﬀ-ﻼ|‖-‗|†-ⸯ|㈀-㏾|𐀀-🝳|А-е]+/, '')
        .gsub(/[가-힣]+/, '')
        .tr('\\', '')
  end
  def hiragana
    NKF.nkf('-w -X', self)
       .tr('ァ-ン','ぁ-ん')
       .tr('０-９ａ-ｚＡ-Ｚ','0-9a-zA-Z')
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
      Natto::MeCab.new('-Oyomi').parse(sentence.japanease).to_s.chomp.hiragana
    when "JUMANPP"
      yomi = ""
      JumanppRuby::Juman.new(force_single_path: :true).parse(sentence.japanease) { |word| yomi = yomi + word[1].to_s.hiragana }
      yomi
    end
  end

end