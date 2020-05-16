require './optparse.rb'
require './mastodon.rb'
require './weathertyping.rb'

opt = Option.new(ARGV, File.basename(__FILE__))
mstdn = MastodonReader.new(opt.get[:service])
max_id = opt.get[:max_id]

(1..opt.get[:num_of_page]).each do

  toot_list, max_id = mstdn.timelines_public(true, max_id)

  toot_list.each do |toot|
    if Toot.accept?(toot, opt.get) then
      status = Toot.format(toot)
      print "#{toot["content"]}\n" if opt.get[:debug]
      print WeatherTyping.entry(status, toot["account"]["username"], "txt") if status.length > 0
    end
  end

end

STDERR.puts "For more toot:\n #{opt.command(File.basename(__FILE__), max_id)}"