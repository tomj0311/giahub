import React from 'react'
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Container,
  useTheme,
  alpha,
  Fade
} from '@mui/material'
import {
  Sparkles,
  Workflow,
  Zap,
  Brain,
  ArrowRight,
  Bot
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Home({ user }) {
  const theme = useTheme()
  const navigate = useNavigate()

  const features = [
    {
      icon: Brain,
      title: 'Intelligent Automation',
      description: 'Leverage advanced AI to automate complex workflows and decision-making processes with unprecedented accuracy.'
    },
    {
      icon: Workflow,
      title: 'Seamless Integration',
      description: 'Connect with your existing tools and systems. GIA adapts to your workflow, not the other way around.'
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Real-time processing and instant responses. Experience the speed of next-generation AI automation.'
    },
    {
      icon: Sparkles,
      title: 'Smart Orchestration',
      description: 'Coordinate multiple AI agents and workflows effortlessly. Build sophisticated automation pipelines in minutes.'
    }
  ]

  return (
    <Box sx={{ 
      minHeight: '100vh',
      background: theme.custom?.backgroundGradient || theme.palette.background.default,
    }}>
      <Container maxWidth="lg">
        {/* Hero Section */}
        <Fade in timeout={800}>
          <Box sx={{ 
            pt: { xs: 8, md: 12 },
            pb: { xs: 6, md: 10 },
            textAlign: 'center'
          }}>
            {/* GIA Logo/Badge */}
            <Box sx={{ 
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              mb: 3,
              px: 2.5,
              py: 1,
              borderRadius: 10,
              background: alpha(theme.palette.primary.main, 0.08),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
            }}>
              <Bot size={20} color={theme.palette.primary.main} />
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: 600,
                  color: theme.palette.primary.main,
                  letterSpacing: 0.5
                }}
              >
                GIA Platform
              </Typography>
            </Box>

            {/* Main Headline */}
            <Typography 
              variant="h2" 
              sx={{ 
                fontWeight: 800,
                mb: 2,
                fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4rem' },
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: 1.2
              }}
            >
              The Future of
              <br />
              Intelligent Automation
            </Typography>

            {/* Subtitle */}
            <Typography 
              variant="h6" 
              color="text.secondary"
              sx={{ 
                mb: 5,
                maxWidth: 680,
                mx: 'auto',
                lineHeight: 1.6,
                fontSize: { xs: '1rem', md: '1.25rem' },
                fontWeight: 400
              }}
            >
              Build, deploy, and orchestrate AI-powered workflows that transform how you work. 
              Experience automation that thinks, adapts, and delivers.
            </Typography>

            {/* CTA Buttons */}
            <Box sx={{ 
              display: 'flex', 
              gap: 2, 
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <Button
                variant="contained"
                size="large"
                endIcon={<ArrowRight size={20} />}
                onClick={() => navigate('/dashboard/agents/home')}
                sx={{ 
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderRadius: 3,
                  textTransform: 'none',
                  boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.3)}`,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                  '&:hover': {
                    boxShadow: `0 12px 32px ${alpha(theme.palette.primary.main, 0.4)}`,
                    transform: 'translateY(-2px)',
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                Get Started
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={() => navigate('/dashboard/agent-playground')}
                sx={{ 
                  px: 4,
                  py: 1.5,
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderRadius: 3,
                  textTransform: 'none',
                  borderWidth: 2,
                  '&:hover': {
                    borderWidth: 2,
                    transform: 'translateY(-2px)',
                  },
                  transition: 'all 0.3s ease'
                }}
              >
                Explore Platform
              </Button>
            </Box>
          </Box>
        </Fade>

        {/* Features Grid */}
        <Box sx={{ pb: 10 }}>
          <Grid container spacing={3}>
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <Grid item xs={12} sm={6} md={3} key={index}>
                  <Fade in timeout={1000 + index * 150}>
                    <Card sx={{
                      height: '100%',
                      p: 3,
                      background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
                      backdropFilter: 'blur(20px)',
                      border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                      borderRadius: 3,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        transform: 'translateY(-8px)',
                        boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.15)}`,
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                      }
                    }}>
                      <CardContent sx={{ p: 0 }}>
                        {/* Icon */}
                        <Box sx={{ 
                          display: 'inline-flex',
                          p: 1.5,
                          borderRadius: 2,
                          background: alpha(theme.palette.primary.main, 0.1),
                          mb: 2
                        }}>
                          <Icon size={28} color={theme.palette.primary.main} />
                        </Box>

                        {/* Title */}
                        <Typography 
                          variant="h6" 
                          sx={{ 
                            fontWeight: 700,
                            mb: 1.5,
                            fontSize: '1.1rem'
                          }}
                        >
                          {feature.title}
                        </Typography>

                        {/* Description */}
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ 
                            lineHeight: 1.7,
                            fontSize: '0.9rem'
                          }}
                        >
                          {feature.description}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Fade>
                </Grid>
              )
            })}
          </Grid>
        </Box>

        {/* Bottom CTA Section */}
        <Fade in timeout={1600}>
          <Box sx={{ 
            pb: 10,
            textAlign: 'center'
          }}>
            <Card sx={{
              p: { xs: 4, md: 6 },
              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)}, ${alpha(theme.palette.secondary.main, 0.05)})`,
              backdropFilter: 'blur(20px)',
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              borderRadius: 4
            }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
                Ready to Transform Your Workflow?
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}>
                Join forward-thinking teams who are already using GIA to automate their most complex processes.
              </Typography>
              <Button
                variant="contained"
                size="large"
                endIcon={<ArrowRight size={20} />}
                onClick={() => navigate('/dashboard/agents/home')}
                sx={{ 
                  px: 5,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  borderRadius: 3,
                  textTransform: 'none',
                  boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.3)}`
                }}
              >
                Start Building Now
              </Button>
            </Card>
          </Box>
        </Fade>
      </Container>
    </Box>
  )
}
