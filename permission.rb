require 'net/http'
require 'json'

PERMISSION_JSON_URL = "https://highemerly.net/snstyping/permission.json"

class TootPermission
  def initialize(service="handon.club", json_url=PERMISSION_JSON_URL)
    @list = JSON.parse(Net::HTTP.get(URI.parse(json_url)))
    @permission = Hash.new()
    @list.each do |user|
      if user["service"]["type"] == "mastodon" && user["service"]["server"] == service then
        @permission[ user["account"]["id"].to_i ] = Hash.new()
        @permission[ user["account"]["id"].to_i ]["public"] = user["permission"]["public"]
        @permission[ user["account"]["id"].to_i ]["unlisted"] = user["permission"]["unlisted"]
      end
    end
  end
  def ok?(toot)
    unless @permission.has_key?(toot["account"]["id"].to_i)
      false
    else
      @permission[toot["account"]["id"].to_i][toot["visibility"]]
    end
  end
end