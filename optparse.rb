require 'optparse'

class Option
  def initialize(argv=ARGV, mode)
    o = OptionParser.new

    @opts = {
      service: "handon.club",
      account_id: 1,
      hagetter_id: 0,
      hashtag: "",
      max_id: 0,
      favourite_threshold: (mode == "user.rb")? 2 : 0,
      accept_unlisted_toot: false,
      limit: 20,
      num_of_page: 10,
      debug: false,
    }

    o.on('-s', '--service STRING', 'Specify service hostname') { |v| @opts[:service] = v }
    o.on('-i', '--account-id VALUE', 'Specify :id for account') { |v| @opts[:account_id] = v.to_i }                                                                     if ["user.rb"].include?(mode)
    o.on('-g', '--hagetter-id VALUE', 'Specify hagetter status id') { |v| @opts[:hagetter_id] = v.to_i }                                                                if ["hagetter.rb"].include?(mode)
    o.on('-t', '--hashtag STRING', 'Specify hashtag (except #)') { |v| @opts[:hashtag] = v }                                                                            if ["hashtag.rb"].include?(mode)
    o.on('-m', '--max-id VALUE', 'Specify initial max_id'){ |v| @opts[:max_id] = v.to_i }                                                                               unless ["hagetter.rb"].include?(mode)
    o.on('-f', '--favourite-threshold VALUE', "Specify threshold of favourite (default: #{@opts[:favourite_threshold]})"){ |v| @opts[:favourite_threshold] = v.to_i }
    o.on('-u', '--with-unlisted-toot', 'Accept not only public but also unlisted toot (default: false)'){ |v| @opts[:accept_unlisted_toot] = v }                        unless ["local_timeline.rb"].include?(mode)
    o.on('-l', '--limit VALUE', 'Specify limit of a number of contents per API page (default: 20)'){ |v| @opts[:limit] = v.to_i }                                       if ["bookmark.rb", "favourite.rb", "hashtag.rb", "local_timeline.rb"].include?(mode)
    o.on('-n', '--number VALUE', 'Specify page count for API call (default: 10)'){ |v| @opts[:num_of_page] = v.to_i }                                                   unless ["hagetter.rb"].include?(mode)
    o.on('-v', '--verbose', 'Set verbose mode (default: false)'){ |v| @opts[:debug] = v }

    o.parse(argv)
  end

  def get
    @opts
  end

  def command(filename, max_id)
    "ruby #{filename} -s #{@opts[:service]} -i #{@opts[:account_id]} #{@opts[:hashtag].length > 0 ? "-t #{@opts[:hashtag]} " : ""}-m #{max_id} -f #{@opts[:favourite_threshold]} #{@opts[:accept_unlisted_toot] ? "-u " : ""}-l #{@opts[:limit]} -n #{@opts[:num_of_page]}"
  end
end


