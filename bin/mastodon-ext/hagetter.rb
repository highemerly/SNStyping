require_relative '../../src/optparse.rb'
require_relative '../../src/mastodon.rb'
require_relative '../../src/weathertyping.rb'

ENDPOINT = "https://hagetter.hansode.club/api/federation/snstyping/statuses/"

class HagetterReader
  def self.toot(hagetter_url)
    uri = URI.parse(hagetter_url)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    headers = { "Authorization" => "none" }
    JSON.parse(http.get(uri, headers).body)
  end
end

opt = Option.new(ARGV, File.basename(__FILE__))
HagetterReader.toot("#{ENDPOINT}#{opt.get[:hagetter_id]}").each do |toot|
    if Toot.accept?(toot, opt.get) then
      status = Toot.format(toot)
      print "#{toot["content"]}\n" if opt.get[:debug]
      print WeatherTyping.entry(status, toot["account"]["username"], "txt") if status.length > 0
    end
end