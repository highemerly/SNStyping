require 'net/http'
require 'json'
require 'sanitize'
require 'uri'
require 'natto'
require 'jumanpp_ruby'

MASTODON_SERVER = "handon.club"
MASTODON_USER_ID = 81 # highemerly: 1, seibe: 81
DEBUG = false
N_PAGE = 30

last_id = 200000000000000000 # 200000000000000000
count = 0
kanji = /[一-龠々]/

class String
  def hiragana!
    self.tr!('ァ-ン','ぁ-ん')
    self.tr!('０-９ａ-ｚＡ-Ｚ','0-9a-zA-Z')
    self.tr!('\\', '')
    self.gsub!(/[[:space:]]/, '')
    self.gsub!(/〜/, 'ー')
    self.tr!('･', '・')
    self.gsub!(/[★☆※○×→←↑↓]/, '')
    self
  end
end

class Toot
  def self.format(toot)
    str = Sanitize.clean(toot["content"]).strip.chomp
    URI.extract(str).uniq.each do |url|
      str.gsub!(url, '')
    end
    str.gsub(%r|\s?(#[^\s　]+)\s?|, '')
  end

  def self.accept?(toot)
    toot["mentions"].empty? && toot["visibility"] == "public" && toot["favourites_count"].to_i >= 2
  end
end

(1..N_PAGE).each do
    uri = URI.parse("https://#{MASTODON_SERVER}/api/v1/accounts/#{MASTODON_USER_ID}/statuses")
     # https://#{MASTODON_SERVER}/api/v1/bookmarks
     # https://#{MASTODON_SERVER}/api/v1/favourites"
    uri.query = URI.encode_www_form({ max_id: last_id })

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme === "https"
    headers = { "Authorization" => "Bearer #{ENV['MASTODON_ACCESS_TOKEN']}" }
    response = http.get(uri, headers)

    JSON.parse(response.body).each do |toot|
      last_id = toot["id"].to_i if last_id > toot["id"].to_i

       if Toot.accept?(toot) then
          count = count + 1
          status = Toot.format(toot)

          puts "原文: #{toot["content"]}" if DEBUG
          puts "#{status} (@#{toot["account"]["username"]})"

          JumanppRuby::Juman.new(force_single_path: :true).parse(status) do |word_juman|
            yomi = word_juman[1].to_s.hiragana!
            if yomi =~ kanji then # Jumanppでの解析失敗時はMecabに回す
              yomi_katakana = ""
              Natto::MeCab.new('-Oyomi').parse(yomi) do |word_mecab|
                yomi_katakana = yomi_katakana + word_mecab.feature.to_s.chomp
              end
              yomi = yomi_katakana.hiragana!
            end
            print yomi
          end

          puts ""
       end
    end
end

puts " count= #{count}, max_id= #{last_id}"