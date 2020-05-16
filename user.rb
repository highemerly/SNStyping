require './optparse.rb'
require './mastodon.rb'
require './weathertyping.rb'

DEBUG = false

opt = Option.new(ARGV)
mstdn = MastodonReader.new(opt.get[:service])
max_id = opt.get[:max_id]

(1..opt.get[:num_of_page]).each do

  toot_list, max_id = mstdn.user_statuses(opt.get[:account_id], max_id)

  toot_list.each do |toot|
    if Toot.accept?(toot) || (opt.get[:accept_unlisted_toot] && Toot.accept?(toot, ["public", "unlisted"])) then
      status = Toot.format(toot)
      print "#{status}\n" if DEBUG
      print WeatherTyping.entry(status, "txt") if status.length > 0
    end
  end

end

STDERR.puts "For more toot: \nruby user.rb -i #{opt.get[:account_id]} -m #{max_id} -n #{opt.get[:num_of_page]}"